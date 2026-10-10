import { Button, EmptyState, PageHeader, PageSection, Tag, TextField } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { allocationKeys, type AllocationKey } from '@/features/network/domain/network';
import {
  fetchSitesResult,
  fetchTransfers,
  receiveTransfer,
  removePartner,
  saveAllocation,
  savePartner,
  sendTransfer,
} from '@/features/network/functions';
import { errorSentence } from '@/lib/errors';
import { CheckField, ChoiceField, ErrorNote, Note } from '@/lib/fields';
import { currentMonth, formatDayTime, formatMoney, formatMonth, formatNumber, formatSigned, shiftMonth } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

const search = z.object({ mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });

// A laundry with several sites (specs/028-sites): what travels between them, with its slip; what
// each site earns; the partners' points.
export const Route = createFileRoute('/_app/pressing/reseau')({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search: { mois } }) => ({ mois }),
  loader: async ({ deps }) => {
    const [board, result] = await Promise.all([
      fetchTransfers(),
      fetchSitesResult({ data: deps.mois ? { month: deps.mois } : {} }),
    ]);
    return { board, result };
  },
  component: NetworkPage,
});

const box = 'rounded-box border border-line bg-surface p-4';
const allocationWords: Record<AllocationKey, [() => string, () => string]> = {
  sales: [m.allocation_sales, m.allocation_sales_hint],
  pieces: [m.allocation_pieces, m.allocation_pieces_hint],
  equal: [m.allocation_equal, m.allocation_equal_hint],
};

function NetworkPage() {
  const { me } = Route.useRouteContext();
  const { board, result } = Route.useLoaderData();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  /** The deposits left out of a group to send, and those ticked on a slip being received. */
  const [left, setLeft] = useState<Set<string>>(new Set());
  const [found, setFound] = useState<Record<string, Set<string>>>({});
  const [partner, setPartner] = useState<{ siteId: string; name: string; phone: string; percent: string } | null>(null);
  if (!board) return <EmptyState title={m.error_not_allowed()} />;
  const siteName = (siteId: string) => board.sites.find((site) => site.siteId === siteId)?.name ?? '';
  const mayRule = can(me, 'settings:manage');
  const onTheRoad = board.transfers.filter((transfer) => transfer.status === 'sent');
  const received = board.transfers.filter((transfer) => transfer.status === 'received').slice(0, 8);

  async function run(work: () => Promise<{ ok: boolean; code?: string }>, done: string) {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (!outcome.ok) return setError(errorSentence(outcome.code ?? ''));
      await router.invalidate();
      setLeft(new Set());
      setFound({});
      setPartner(null);
      setSaid(done);
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }
  const toggle = (set: Set<string>, id: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  };

  return (
    <>
      <PageHeader title={m.nav_network()} description={m.network_description()} />
      <div className="mb-4 flex flex-col gap-3 empty:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>

      <PageSection first title={m.transfers_to_send()}>
        {board.sites.filter((site) => site.active).length < 2 ? (
          <p className="text-fg-muted">{m.transfers_one_site()}</p>
        ) : board.toSend.length === 0 ? (
          <p className="text-fg-muted">{m.transfers_nothing()}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {board.toSend.map((group) => {
              const going = group.orders.filter((order) => !left.has(order.orderId));
              return (
                <li key={`${group.fromSiteId}>${group.toSiteId}`} className={box}>
                  <p className="font-heading text-title font-semibold">
                    {m.transfers_route({ from: siteName(group.fromSiteId), to: siteName(group.toSiteId) })}
                  </p>
                  <div className="mt-2 flex flex-col">
                    {group.orders.map((order) => (
                      <CheckField
                        key={order.orderId}
                        label={`${order.number} · ${order.customerName}`}
                        hint={m.transfers_content({ pieces: formatNumber(order.pieces), kilos: formatNumber(order.kilos, 1) })}
                        checked={!left.has(order.orderId)}
                        disabled={!board.maySend}
                        onChange={(on) => setLeft((current) => toggle(current, order.orderId, !on))}
                      />
                    ))}
                  </div>
                  {board.maySend && (
                    <div className="mt-3">
                      <Button
                        disabled={busy || going.length === 0}
                        onClick={() =>
                          void run(
                            () =>
                              sendTransfer({
                                data: {
                                  fromSiteId: group.fromSiteId,
                                  toSiteId: group.toSiteId,
                                  orderIds: going.map((order) => order.orderId),
                                },
                              }),
                            m.transfers_sent({ count: going.length, to: siteName(group.toSiteId) }),
                          )
                        }
                      >
                        {m.transfers_send({ count: going.length, to: siteName(group.toSiteId) })}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PageSection>

      <PageSection title={m.transfers_on_the_road()}>
        {onTheRoad.length === 0 ? (
          <p className="text-fg-muted">{m.transfers_none_on_the_road()}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {onTheRoad.map((transfer) => {
              const ticked = found[transfer.transferId] ?? new Set(transfer.lines.map((line) => line.orderId));
              return (
                <li key={transfer.transferId} className={box}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <a className="font-heading text-title font-semibold text-fg-link underline" href={`/transferts/${transfer.transferId}`}>
                      {m.transfers_slip({ number: transfer.number })}
                    </a>
                    <span className="text-body-sm text-fg-muted">
                      {m.transfers_route({ from: transfer.fromName, to: transfer.toName })} · {formatDayTime(transfer.sentAt)}
                    </span>
                  </div>
                  <div className="mt-2 flex flex-col">
                    {transfer.lines.map((line) => (
                      <CheckField
                        key={line.orderId}
                        label={`${line.number} · ${line.customerName}`}
                        hint={m.transfers_content({ pieces: formatNumber(line.pieces), kilos: formatNumber(line.kilos, 1) })}
                        checked={ticked.has(line.orderId)}
                        disabled={!board.mayReceive}
                        onChange={(on) =>
                          setFound((current) => ({ ...current, [transfer.transferId]: toggle(ticked, line.orderId, on) }))
                        }
                      />
                    ))}
                  </div>
                  {board.mayReceive && (
                    <div className="mt-3">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => receiveTransfer({ data: { transferId: transfer.transferId, receivedOrderIds: [...ticked] } }),
                            ticked.size === transfer.lines.length
                              ? m.transfers_received_all({ number: transfer.number })
                              : m.transfers_received_some({
                                  number: transfer.number,
                                  missing: transfer.lines.length - ticked.size,
                                }),
                          )
                        }
                      >
                        {m.transfers_receive({ count: ticked.size, total: transfer.lines.length })}
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {board.missing.length > 0 && (
          <div className="mt-4">
            <ErrorNote>
              {m.transfers_missing({
                count: board.missing.length,
                numbers: board.missing.map((order) => order.number).join(', '),
              })}
            </ErrorNote>
          </div>
        )}
        {received.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 text-body-sm">
            {received.map((transfer) => (
              <li key={transfer.transferId} className="flex flex-wrap items-baseline gap-x-3">
                <a className="font-semibold text-fg-link underline" href={`/transferts/${transfer.transferId}`}>
                  {transfer.number}
                </a>
                <span className="text-fg-muted">
                  {m.transfers_route({ from: transfer.fromName, to: transfer.toName })} ·{' '}
                  {m.transfers_received_count({
                    received: transfer.lines.filter((line) => line.received).length,
                    total: transfer.lines.length,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      {result && (
        <PageSection title={m.sites_result_title()}>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => void navigate({ search: { mois: shiftMonth(result.month, -1) } })}>
              {m.month_previous()}
            </Button>
            <span className="font-heading text-title font-semibold">{formatMonth(result.month)}</span>
            <Button
              variant="secondary"
              disabled={result.month >= currentMonth()}
              onClick={() => void navigate({ search: { mois: shiftMonth(result.month, 1) } })}
            >
              {m.month_next()}
            </Button>
          </div>
          <ul className="flex flex-col gap-3">
            {result.sites.map((site) => (
              <li key={site.siteId} className={box}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-heading text-title font-semibold">{site.name}</span>
                  <span className="font-number font-semibold">{formatSigned(site.result)}</span>
                </div>
                <p className="text-body-sm text-fg-muted">
                  {m.sites_received({ orders: formatNumber(site.orders), pieces: formatNumber(site.pieces), sales: formatMoney(site.sales) })}
                </p>
                <dl className="mt-2 grid grid-cols-3 gap-2 text-body-sm">
                  <div>
                    <dt className="text-fg-muted">{m.sites_cashed()}</dt>
                    <dd className="font-number font-semibold">{formatMoney(site.cashed)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{m.sites_charges()}</dt>
                    <dd className="font-number font-semibold">{formatMoney(site.charges)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{m.sites_shared()}</dt>
                    <dd className="font-number font-semibold">{formatMoney(site.shared)}</dd>
                  </div>
                </dl>
                {site.commission !== null && (
                  <p className="mt-2 text-body-sm">
                    <Tag tone="neutral">{m.partner_tag()}</Tag>{' '}
                    {m.partner_commission({ amount: formatMoney(site.commission) })}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex max-w-xl flex-col gap-1">
            {result.prepaid !== 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-fg-muted">{m.sites_prepaid()}</dt>
                <dd className="font-number">{formatSigned(result.prepaid)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">{m.sites_shared_total()}</dt>
              <dd className="font-number">{formatMoney(result.sharedCharges)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 font-semibold">
              <dt>{m.sites_total()}</dt>
              <dd className="font-number">{formatSigned(result.total.result)}</dd>
            </div>
          </dl>
          <p className="mt-3 max-w-3xl text-body-sm text-fg-muted">{m.sites_how()}</p>
          <div className="mt-5 max-w-xl">
            <ChoiceField
              label={m.allocation_title()}
              value={result.allocation}
              options={allocationKeys.map((key) => ({ value: key, label: allocationWords[key][0](), hint: allocationWords[key][1]() }))}
              onChange={(allocation) => {
                if (mayRule && allocation !== result.allocation) {
                  void run(() => saveAllocation({ data: { allocation } }), m.allocation_saved());
                }
              }}
            />
          </div>
        </PageSection>
      )}

      {result && mayRule && (
        <PageSection title={m.partners_title()}>
          <p className="mb-3 max-w-3xl text-body-sm text-fg-muted">{m.partners_hint()}</p>
          <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
            {board.sites
              .filter((site) => site.active && site.kind !== 'plant')
              .map((site) => {
                const point = result.partners.find((each) => each.siteId === site.siteId);
                return (
                  <li key={site.siteId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span className="min-w-0">
                      <span className="font-semibold">{site.name}</span>
                      <span className="block text-body-sm text-fg-muted">
                        {point
                          ? m.partner_line({ name: point.partnerName, percent: formatNumber(point.commissionPercent, 1) })
                          : m.partner_own()}
                      </span>
                    </span>
                    <span className="flex flex-wrap gap-3">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          setPartner({
                            siteId: site.siteId,
                            name: point?.partnerName ?? '',
                            phone: point?.phone ?? '',
                            percent: point ? String(point.commissionPercent) : '',
                          })
                        }
                      >
                        {m.partner_edit({ site: site.name })}
                      </Button>
                      {point && (
                        <Button
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void run(() => removePartner({ data: { siteId: site.siteId } }), m.partner_removed({ site: site.name }))}
                        >
                          {m.partner_remove({ site: site.name })}
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
          </ul>
          {partner && (
            <div className="mt-3 flex max-w-xl flex-col gap-4">
              <TextField
                label={m.partner_name()}
                value={partner.name}
                maxLength={120}
                onChange={(event) => setPartner({ ...partner, name: event.target.value })}
              />
              <TextField
                label={m.customer_phone()}
                type="tel"
                value={partner.phone}
                onChange={(event) => setPartner({ ...partner, phone: event.target.value })}
              />
              <TextField
                label={m.partner_percent()}
                hint={m.partner_percent_hint()}
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                value={partner.percent}
                onChange={(event) => setPartner({ ...partner, percent: event.target.value })}
              />
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busy || partner.name.trim() === '' || !(Number(partner.percent || 0) >= 0 && Number(partner.percent || 0) <= 100)}
                  onClick={() =>
                    void run(
                      () =>
                        savePartner({
                          data: {
                            siteId: partner.siteId,
                            partnerName: partner.name,
                            phone: partner.phone,
                            commissionPercent: Number(partner.percent || 0),
                          },
                        }),
                      m.partner_saved({ name: partner.name }),
                    )
                  }
                >
                  {m.partner_save()}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setPartner(null)}>
                  {m.action_cancel()}
                </Button>
              </div>
            </div>
          )}
        </PageSection>
      )}
    </>
  );
}
