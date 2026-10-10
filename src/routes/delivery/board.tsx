import { Button, EmptyState, PageHeader, PageSection, Tag, TextField } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { fetchCustomers } from '@/features/customers/functions';
import {
  assignTrip,
  completeTrip,
  failTrip,
  fetchBoard,
  planTrip,
  saveZone,
  startTrip,
} from '@/features/delivery/functions';
import type { Delivery } from '@/features/delivery/infrastructure/delivery.tables';
import { deliveryKindWords, deliveryStatusTones, deliveryStatusWords } from '@/features/delivery/ui/words';
import type { PaymentMethod } from '@/features/orders';
import { gestureKey, MoneyFields, wholeAmount } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note, SelectField } from '@/lib/fields';
import { currentDay, formatDay, formatMoney } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// Collecting and delivering (specs/027-delivery): the courier's round first, then what is planned
// for the day, then the zones and their fees.
export const Route = createFileRoute('/_app/livraisons')({
  loader: async () => {
    const [board, customers] = await Promise.all([fetchBoard({ data: {} }), fetchCustomers({ data: {} })]);
    return { board, customers };
  },
  component: DeliveryPage,
});

const box = 'rounded-box border border-line bg-surface p-4';
type Result = { ok: boolean; code?: string };

function DeliveryPage() {
  const { me } = Route.useRouteContext();
  const { board, customers } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ id: string; how: 'done' | 'failed' } | null>(null);
  const [recipient, setRecipient] = useState('');
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [key, setKey] = useState(() => gestureKey('dlv'));
  const [form, setForm] = useState<'collect' | 'zone' | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [zoneId, setZoneId] = useState('');
  const [address, setAddress] = useState('');
  const [day, setDay] = useState(currentDay());
  const [zoneName, setZoneName] = useState('');
  const [fee, setFee] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  if (!board) return <EmptyState title={m.error_not_allowed()} />;
  const zones = board.zones.filter((zone) => zone.active);
  const mayRule = can(me, 'settings:manage');

  async function run(work: () => Promise<Result>, done: string) {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (!outcome.ok) return setError(errorSentence(outcome.code ?? ''));
      await router.invalidate();
      setClosing(null);
      setForm(null);
      setEditing(null);
      setRecipient('');
      setNote('');
      setAmount('');
      setKey(gestureKey('dlv'));
      setSaid(done);
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const title = (trip: Delivery) =>
    trip.orderNumber
      ? `${deliveryKindWords[trip.kind]()} · ${trip.orderNumber} · ${trip.customerName}`
      : `${deliveryKindWords[trip.kind]()} · ${trip.customerName}`;
  const where = (trip: Delivery) => `${trip.zoneName} · ${trip.address}`;

  return (
    <>
      <PageHeader title={m.nav_delivery()} description={m.trip_description()} />
      <div className="mb-4 flex flex-col gap-3 empty:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>

      {board.mayRun && (
        <PageSection first title={m.trip_round()}>
          {board.round.length === 0 ? (
            <p className="text-fg-muted">{m.trip_round_empty()}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {board.round.map((trip) => {
                const paying = wholeAmount(amount);
                return (
                  <li key={trip.deliveryId} className={box}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <span className="font-heading text-title font-semibold">{title(trip)}</span>
                      <Tag tone={deliveryStatusTones[trip.status]}>{deliveryStatusWords[trip.status]()}</Tag>
                    </div>
                    <p>{where(trip)}</p>
                    <p className="text-body-sm text-fg-muted">
                      {trip.customerPhone}
                      {trip.kind === 'deliver' &&
                        ` · ${trip.balance > 0 ? m.trip_to_collect({ amount: formatMoney(trip.balance) }) : m.order_paid_in_full()}`}
                      {trip.courierId === null && ` · ${m.trip_unassigned()}`}
                    </p>
                    {trip.note && <p className="text-body-sm text-fg-muted">{trip.note}</p>}
                    {closing?.id !== trip.deliveryId && (
                      <div className="mt-3 flex flex-wrap gap-3">
                        {trip.status === 'planned' && (
                          <Button
                            disabled={busy}
                            onClick={() => void run(() => startTrip({ data: { deliveryId: trip.deliveryId } }), m.trip_started())}
                          >
                            {m.trip_start()}
                          </Button>
                        )}
                        {trip.status === 'out' && (
                          <>
                            <Button
                              disabled={busy}
                              onClick={() => {
                                setClosing({ id: trip.deliveryId, how: 'done' });
                                setAmount(trip.kind === 'deliver' && trip.balance > 0 ? String(trip.balance) : '');
                              }}
                            >
                              {trip.kind === 'deliver' ? m.trip_hand_over() : m.trip_collected()}
                            </Button>
                            <Button
                              variant="secondary"
                              disabled={busy}
                              onClick={() => setClosing({ id: trip.deliveryId, how: 'failed' })}
                            >
                              {m.trip_fail()}
                            </Button>
                          </>
                        )}
                        <a
                          className="inline-flex h-(--control-height) items-center font-semibold text-fg-link underline"
                          href={`/livraisons/${trip.deliveryId}`}
                        >
                          {m.trip_slip()}
                        </a>
                      </div>
                    )}
                    {closing?.id === trip.deliveryId && closing.how === 'done' && (
                      <div className="mt-3 flex max-w-xl flex-col gap-4">
                        <TextField
                          label={m.trip_recipient()}
                          hint={m.trip_recipient_hint()}
                          value={recipient}
                          maxLength={120}
                          onChange={(event) => setRecipient(event.target.value)}
                        />
                        {trip.kind === 'deliver' && trip.balance > 0 && (
                          <MoneyFields
                            amount={amount}
                            method={method}
                            hint={m.order_balance_of({ amount: formatMoney(trip.balance) })}
                            onAmount={setAmount}
                            onMethod={setMethod}
                          />
                        )}
                        <TextField label={m.counter_note()} value={note} maxLength={300} onChange={(event) => setNote(event.target.value)} />
                        <div className="flex flex-wrap gap-3">
                          <Button
                            disabled={busy || recipient.trim() === ''}
                            onClick={() =>
                              void run(
                                () =>
                                  completeTrip({
                                    data: {
                                      key,
                                      proof: {
                                        deliveryId: trip.deliveryId,
                                        recipient,
                                        note,
                                        ...(trip.kind === 'deliver' && trip.balance > 0 && paying !== null
                                          ? { payment: { amount: paying, method } }
                                          : {}),
                                      },
                                    },
                                  }),
                                trip.kind === 'deliver'
                                  ? m.trip_done_said({ number: trip.orderNumber ?? '', name: recipient })
                                  : m.trip_collected_said({ name: trip.customerName }),
                              )
                            }
                          >
                            {trip.kind === 'deliver' ? m.trip_hand_over() : m.trip_collected()}
                          </Button>
                          <Button variant="secondary" disabled={busy} onClick={() => setClosing(null)}>
                            {m.action_cancel()}
                          </Button>
                        </div>
                      </div>
                    )}
                    {closing?.id === trip.deliveryId && closing.how === 'failed' && (
                      <div className="mt-3 flex max-w-xl flex-col gap-4">
                        <TextField
                          label={m.trip_fail_reason()}
                          value={note}
                          maxLength={300}
                          onChange={(event) => setNote(event.target.value)}
                        />
                        <div className="flex flex-wrap gap-3">
                          <Button
                            disabled={busy || note.trim() === ''}
                            onClick={() =>
                              void run(() => failTrip({ data: { deliveryId: trip.deliveryId, reason: note } }), m.trip_failed_said())
                            }
                          >
                            {m.trip_fail()}
                          </Button>
                          <Button variant="secondary" disabled={busy} onClick={() => setClosing(null)}>
                            {m.action_cancel()}
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </PageSection>
      )}

      {board.mayPlan && (
        <PageSection first={!board.mayRun} title={m.trip_day_title({ day: formatDay(board.day) })}>
          {board.trips.length === 0 ? (
            <p className="text-fg-muted">{m.trip_none()}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
              {board.trips.map((trip) => (
                <li key={trip.deliveryId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <a className="font-semibold text-fg-link underline" href={`/livraisons/${trip.deliveryId}`}>
                      {title(trip)}
                    </a>
                    <span className="block text-body-sm text-fg-muted">
                      {where(trip)}
                      {trip.recipient && ` · ${m.trip_received_by({ name: trip.recipient })}`}
                      {trip.failure && ` · ${trip.failure}`}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-3">
                    {trip.status === 'planned' ? (
                      <select
                        aria-label={m.trip_courier_of({ what: title(trip) })}
                        className="h-(--control-height) rounded-control border border-line-strong bg-surface-control px-3 font-ui text-body text-fg"
                        disabled={busy}
                        value={trip.courierId ?? ''}
                        onChange={(event) =>
                          void run(
                            () => assignTrip({ data: { deliveryId: trip.deliveryId, courierId: event.target.value || null } }),
                            m.trip_assigned(),
                          )
                        }
                      >
                        <option value="">{m.trip_unassigned()}</option>
                        {board.couriers.map((courier) => (
                          <option key={courier.userId} value={courier.userId}>
                            {courier.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-body-sm text-fg-muted">
                        {board.couriers.find((courier) => courier.userId === trip.courierId)?.name ?? ''}
                      </span>
                    )}
                    <Tag tone={deliveryStatusTones[trip.status]}>{deliveryStatusWords[trip.status]()}</Tag>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 max-w-3xl text-body-sm text-fg-muted">{m.trip_plan_hint()}</p>
          {form !== 'collect' && zones.length > 0 && (
            <div className="mt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setForm('collect');
                  setZoneId(zones[0]?.zoneId ?? '');
                  setCustomerId(customers?.[0]?.customerId ?? '');
                  setAddress('');
                }}
              >
                {m.trip_plan_collect()}
              </Button>
            </div>
          )}
          {form === 'collect' && (
            <div className="mt-3 flex max-w-xl flex-col gap-4">
              <SelectField
                label={m.quote_customer()}
                value={customerId}
                onChange={(event) => setCustomerId(event.target.value)}
                options={(customers ?? []).map((customer) => ({ value: customer.customerId, label: customer.name }))}
              />
              <SelectField
                label={m.trip_zone()}
                value={zoneId}
                onChange={(event) => setZoneId(event.target.value)}
                options={zones.map((zone) => ({ value: zone.zoneId, label: zone.name }))}
              />
              <TextField label={m.trip_address()} value={address} maxLength={300} onChange={(event) => setAddress(event.target.value)} />
              <TextField label={m.trip_day()} type="date" value={day} onChange={(event) => setDay(event.target.value)} />
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={busy || !customerId || !zoneId || address.trim() === ''}
                  onClick={() =>
                    void run(
                      () => planTrip({ data: { kind: 'collect', customerId, zoneId, address, plannedOn: day } }),
                      m.trip_planned(),
                    )
                  }
                >
                  {m.trip_plan_confirm()}
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>
                  {m.action_cancel()}
                </Button>
              </div>
            </div>
          )}
        </PageSection>
      )}

      <PageSection first={!board.mayRun && !board.mayPlan} title={m.trip_zones()}>
        <p className="mb-3 max-w-3xl text-body-sm text-fg-muted">{m.trip_zones_hint()}</p>
        {board.zones.length === 0 ? (
          <p className="text-fg-muted">{m.trip_zones_none()}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
            {board.zones.map((zone) => (
              <li key={zone.zoneId} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="font-semibold">
                  {zone.name}
                  {!zone.active && <span className="ml-2 font-normal text-fg-muted">{m.trip_zone_off()}</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-number">{zone.fee > 0 ? formatMoney(zone.fee) : m.trip_free()}</span>
                  {mayRule && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setForm('zone');
                        setEditing(zone.zoneId);
                        setZoneName(zone.name);
                        setFee(String(zone.fee));
                      }}
                    >
                      {m.trip_zone_edit({ name: zone.name })}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {mayRule && form !== 'zone' && (
          <div className="mt-3">
            <Button
              variant="secondary"
              onClick={() => {
                setForm('zone');
                setEditing(null);
                setZoneName('');
                setFee('');
              }}
            >
              {m.trip_zone_add()}
            </Button>
          </div>
        )}
        {form === 'zone' && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <TextField label={m.trip_zone_name()} value={zoneName} maxLength={80} onChange={(event) => setZoneName(event.target.value)} />
            <TextField
              label={m.trip_zone_fee()}
              hint={m.trip_zone_fee_hint()}
              type="number"
              inputMode="numeric"
              min={0}
              value={fee}
              onChange={(event) => setFee(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || zoneName.trim() === '' || !/^\d*$/.test(fee.trim())}
                onClick={() =>
                  void run(
                    () =>
                      saveZone({
                        data: { ...(editing ? { zoneId: editing } : {}), name: zoneName, fee: Number(fee || 0), active: true },
                      }),
                    m.trip_zone_saved({ name: zoneName }),
                  )
                }
              >
                {m.trip_zone_save()}
              </Button>
              {editing && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () => saveZone({ data: { zoneId: editing, name: zoneName, fee: Number(fee || 0), active: false } }),
                      m.trip_zone_closed({ name: zoneName }),
                    )
                  }
                >
                  {m.trip_zone_close()}
                </Button>
              )}
              <Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>
                {m.action_cancel()}
              </Button>
            </div>
          </div>
        )}
      </PageSection>
    </>
  );
}
