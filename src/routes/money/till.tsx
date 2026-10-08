import {
  Button,
  DataTable,
  Drawer,
  EmptyState,
  Facts,
  PageHeader,
  PageSection,
  Tag,
  TextField,
} from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { receives } from '@/features/business/domain/sites';
import { fetchBusiness } from '@/features/business/functions';
import type { CashSession } from '@/features/money';
import { closeTill, depositAtBank, fetchSessions, openTill } from '@/features/money/functions';
import { gestureKey } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note, SelectField } from '@/lib/fields';
import { formatDayTime, formatMoney, formatSigned } from '@/lib/format';
import type { Outcome } from '@/lib/rule-error';
import * as m from '@/paraglide/messages.js';

// The till (specs/003-money-day, US1): open it with its float, follow what it should hold, count
// it, close it. The gap is kept, never corrected.
export const Route = createFileRoute('/_app/argent/caisse')({
  loader: async () => ({ sessions: await fetchSessions(), business: await fetchBusiness() }),
  component: TillPage,
});

type Gesture = 'open' | 'close' | 'bank';

function TillPage() {
  const { me } = Route.useRouteContext();
  const { sessions, business } = Route.useLoaderData();
  const router = useRouter();
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [target, setTarget] = useState<CashSession | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const sites = (business?.sites ?? []).filter((site) => site.active && receives(site.kind));
  const [siteId, setSiteId] = useState(sites[0]?.siteId ?? '');
  const [key, setKey] = useState(() => gestureKey('till'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState<{ expected: number; counted: number; gap: number } | null>(null);
  if (!sessions) return <EmptyState title={m.error_not_allowed()} />;
  const siteName = (id: string) => sites.find((site) => site.siteId === id)?.name ?? '';
  const open = sessions.filter((session) => !session.closedAt);
  const past = sessions.filter((session) => session.closedAt);

  const start = (next: Gesture, session: CashSession | null = null) => {
    setError(null);
    setAmount('');
    setNote('');
    setTarget(session);
    setGesture(next);
  };

  async function run<T>(work: () => Promise<Outcome<T>>, after?: (output: T) => void) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        after?.(outcome.output);
        setGesture(null);
        setKey(gestureKey('till'));
        await router.invalidate();
      } else {
        setError(
          outcome.code === 'cash_not_in_till'
            ? m.error_cash_not_in_till({ amount: formatMoney(Number(outcome.facts['amount'] ?? 0)) })
            : errorSentence(outcome.code),
        );
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const value = Number(amount);
  const valid = amount.trim() !== '' && Number.isInteger(value) && value >= (gesture === 'bank' ? 1 : 0);
  const submit = () => {
    if (!valid) return setError(m.error_amount());
    if (gesture === 'open') return void run(() => openTill({ data: { siteId, openingFloat: value } }));
    if (gesture === 'close' && target) {
      return void run(
        () => closeTill({ data: { sessionId: target.sessionId, counted: value, note } }),
        (output) => setClosed(output),
      );
    }
    if (gesture === 'bank' && target) {
      return void run(() =>
        depositAtBank({ data: { key, deposit: { sessionId: target.sessionId, amount: value, note } } }),
      );
    }
    return undefined;
  };
  const titles: Record<Gesture, () => string> = {
    open: m.till_open,
    close: m.till_close,
    bank: m.till_bank,
  };

  return (
    <>
      <PageHeader
        title={m.nav_till()}
        description={m.till_description()}
        actions={<Button onClick={() => start('open')}>{m.till_open()}</Button>}
      />
      {closed && (
        <div className="mb-6">
          <Note>
            {closed.gap === 0
              ? m.till_closed_right({ counted: formatMoney(closed.counted) })
              : m.till_closed_gap({
                  counted: formatMoney(closed.counted),
                  expected: formatMoney(closed.expected),
                  gap: formatSigned(closed.gap),
                })}
          </Note>
        </div>
      )}
      {open.length === 0 ? (
        <EmptyState title={m.till_none_title()}>{m.till_none_body()}</EmptyState>
      ) : (
        open.map((session) => (
          <section
            key={session.sessionId}
            className="mb-6 rounded-box border border-line-strong bg-surface p-5"
          >
            <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-title font-semibold">
                {siteName(session.siteId)} · {session.cashierName}
              </h2>
              <Tag tone="info">{m.till_open_since({ date: formatDayTime(session.openedAt) })}</Tag>
            </header>
            <Facts
              items={[
                { label: m.till_float(), value: formatMoney(session.openingFloat) },
                { label: m.till_cash_in(), value: formatMoney(session.cashIn) },
                { label: m.till_refunds(), value: formatMoney(session.cashRefunds) },
                { label: m.till_expenses(), value: formatMoney(session.expenses) },
                { label: m.till_draws(), value: formatMoney(session.draws) },
                { label: m.till_bank_deposits(), value: formatMoney(session.bankDeposits) },
              ]}
            />
            <p className="mt-4 flex items-baseline justify-between gap-3 border-t border-line pt-4 text-title font-semibold">
              <span>{m.till_expected()}</span>
              <span className="font-number">{formatMoney(session.expected)}</span>
            </p>
            <p className="mt-1 text-body-sm text-fg-muted">{m.till_expected_how()}</p>
            {(session.cashierId === me.userId || me.permissions.includes('money:read')) && (
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <Button variant="secondary" onClick={() => start('bank', session)}>
                  {m.till_bank()}
                </Button>
                <Button onClick={() => start('close', session)}>{m.till_close()}</Button>
              </div>
            )}
          </section>
        ))
      )}

      {past.length > 0 && (
        <PageSection title={m.till_past()}>
          <DataTable
            caption={m.till_past()}
            rows={past}
            rowKey={(session) => session.sessionId}
            columns={[
              {
                key: 'closed',
                label: m.till_closed_on(),
                render: (session) => (
                  <>
                    {session.closedAt ? formatDayTime(session.closedAt) : ''}
                    <span className="block text-body-sm text-fg-muted">
                      {siteName(session.siteId)} · {session.cashierName}
                    </span>
                  </>
                ),
              },
              {
                key: 'expected',
                label: m.till_expected(),
                align: 'end',
                render: (session) => formatMoney(session.expected),
              },
              {
                key: 'counted',
                label: m.till_counted(),
                align: 'end',
                render: (session) => formatMoney(session.counted ?? 0),
              },
              {
                key: 'gap',
                label: m.till_gap(),
                align: 'end',
                render: (session) =>
                  session.gap === 0 ? (
                    <Tag tone="validated">{m.till_right()}</Tag>
                  ) : (
                    <Tag tone="error">{formatSigned(session.gap ?? 0)}</Tag>
                  ),
              },
            ]}
          />
        </PageSection>
      )}

      <Drawer
        open={gesture !== null}
        onClose={() => setGesture(null)}
        title={gesture ? titles[gesture]() : ''}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGesture(null)}>
              {m.action_cancel()}
            </Button>
            <Button disabled={busy || !valid} onClick={submit}>
              {gesture ? titles[gesture]() : ''}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {gesture === 'open' && sites.length > 1 && (
            <SelectField
              label={m.counter_site()}
              value={siteId}
              onChange={(event) => setSiteId(event.target.value)}
              options={sites.map((site) => ({ value: site.siteId, label: site.name }))}
            />
          )}
          <TextField
            label={
              gesture === 'open'
                ? m.till_float_label()
                : gesture === 'close'
                  ? m.till_counted_label()
                  : m.money_amount()
            }
            {...(gesture === 'close' ? { hint: m.till_counted_hint() } : {})}
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
          />
          {gesture !== 'open' && (
            <TextField
              label={m.counter_note()}
              value={note}
              maxLength={300}
              onChange={(event) => setNote(event.target.value)}
            />
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Drawer>
    </>
  );
}
