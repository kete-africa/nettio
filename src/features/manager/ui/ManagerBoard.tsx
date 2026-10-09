import { Button, ConfirmDialog, PageSection, Tag, TextField } from '@kete/design';
import { Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote, Note } from '@/lib/fields';
import { formatDay, formatDayTime, formatMoney } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { ScheduleView, UnclaimedView } from '../capabilities';
import {
  chargeStorage,
  closeComplaint,
  decideApproval,
  releaseDeposit,
  saveRules,
  saveWeek,
  warnCustomer,
  type ManagerView,
} from '../functions';
import { approvalWords, clock, complaintWords, minuteOf, weekdayWords } from './words';

type Result = { ok: boolean; code?: string };

/** One gesture at a time on the board: its outcome said in a sentence, the board read again. */
function useGesture() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  async function run(work: () => Promise<Result>, done: string): Promise<boolean> {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (!outcome.ok) {
        setError(errorSentence(outcome.code ?? ''));
        return false;
      }
      await router.invalidate();
      setSaid(done);
      return true;
    } catch {
      setError(m.error_generic());
      return false;
    } finally {
      setBusy(false);
    }
  }
  const notes = (
    <div className="mb-3 flex flex-col gap-3 empty:hidden" aria-live="polite">
      {said && <Note>{said}</Note>}
      <ErrorNote>{error}</ErrorNote>
    </div>
  );
  return { busy, run, notes };
}

const box = 'rounded-box border border-line bg-surface p-4';

function OrderLink({ orderId, number, customer }: { orderId: string; number: string; customer: string }) {
  return (
    <Link to="/depots/$orderId" params={{ orderId }} className="font-semibold text-fg-link underline">
      {number} · {customer}
    </Link>
  );
}

/** What was asked of a manager: she grants or refuses; whoever asked reads the answer. */
export function Approvals({ view, first }: { view: NonNullable<ManagerView['approvals']>; first: boolean }) {
  const { busy, run, notes } = useGesture();
  const [granting, setGranting] = useState<string | null>(null);
  const pending = view.approvals.filter((approval) => approval.status === 'pending');
  const decided = view.approvals.filter((approval) => approval.status !== 'pending').slice(0, 10);
  const chosen = pending.find((approval) => approval.approvalId === granting);
  const said = (approval: (typeof pending)[number]) =>
    approval.kind === 'cancel'
      ? approvalWords[approval.kind]()
      : `${approvalWords[approval.kind]()} — ${formatMoney(approval.amount)}`;
  return (
    <PageSection first={first} title={m.approvals_title()}>
      {notes}
      {pending.length === 0 ? (
        <p className="text-fg-muted">{m.approvals_none()}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {pending.map((approval) => (
            <li key={approval.approvalId} className={box}>
              <p className="font-heading text-title font-semibold">{said(approval)}</p>
              <p>
                <OrderLink orderId={approval.orderId} number={approval.orderNumber} customer={approval.customerName} />
              </p>
              <p className="mt-1">{approval.reason}</p>
              <p className="text-body-sm text-fg-muted">
                {m.approval_asked_by({
                  name: approval.requestedByName || m.approval_someone(),
                  date: formatDayTime(approval.requestedAt),
                })}
              </p>
              {view.mayDecide && (
                <div className="mt-3 flex flex-wrap gap-3">
                  <Button disabled={busy} onClick={() => setGranting(approval.approvalId)}>
                    {m.approval_grant()}
                  </Button>
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => decideApproval({ data: { approvalId: approval.approvalId, approve: false, note: '' } }),
                        m.approval_refused({ number: approval.orderNumber }),
                      )
                    }
                  >
                    {m.approval_refuse()}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 text-body-sm">
          {decided.map((approval) => (
            <li key={approval.approvalId} className="flex flex-wrap items-baseline gap-x-3">
              <Tag tone={approval.status === 'approved' ? 'validated' : 'neutral'}>
                {approval.status === 'approved' ? m.approval_status_approved() : m.approval_status_refused()}
              </Tag>
              <span>
                {said(approval)} · {approval.orderNumber}
              </span>
              <span className="text-fg-muted">{approval.reason}</span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={chosen !== undefined}
        title={m.review_confirm_title()}
        confirmLabel={m.approval_grant()}
        cancelLabel={m.action_close()}
        onCancel={() => setGranting(null)}
        onConfirm={() => {
          if (!chosen) return;
          setGranting(null);
          void run(
            () => decideApproval({ data: { approvalId: chosen.approvalId, approve: true, note: '' } }),
            m.approval_granted({ number: chosen.orderNumber }),
          );
        }}
      >
        {chosen ? m.approval_confirm({ what: said(chosen), number: chosen.orderNumber }) : ''}
      </ConfirmDialog>
    </PageSection>
  );
}

/** The customers' complaints: each one closed with what was decided and what the laundry gave. */
export function Complaints({
  complaints,
  mayResolve,
  first,
}: {
  complaints: NonNullable<ManagerView['complaints']>;
  mayResolve: boolean;
  first: boolean;
}) {
  const { busy, run, notes } = useGesture();
  const [closing, setClosing] = useState<string | null>(null);
  const [resolution, setResolution] = useState('');
  const [compensation, setCompensation] = useState('');
  const open = complaints.filter((complaint) => complaint.status === 'open');
  const closed = complaints.filter((complaint) => complaint.status === 'resolved').slice(0, 10);
  return (
    <PageSection first={first} title={m.complaints_title()}>
      {notes}
      {open.length === 0 ? (
        <p className="text-fg-muted">{m.complaints_none()}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {open.map((complaint) => (
            <li key={complaint.complaintId} className={box}>
              <p className="font-heading text-title font-semibold">{complaintWords[complaint.kind]()}</p>
              <p>
                <OrderLink orderId={complaint.orderId} number={complaint.orderNumber} customer={complaint.customerName} />
              </p>
              <p className="mt-1">{complaint.description}</p>
              <p className="text-body-sm text-fg-muted">{formatDayTime(complaint.createdAt)}</p>
              {mayResolve && closing !== complaint.complaintId && (
                <div className="mt-3">
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setClosing(complaint.complaintId);
                      setResolution('');
                      setCompensation('');
                    }}
                  >
                    {m.complaint_close()}
                  </Button>
                </div>
              )}
              {closing === complaint.complaintId && (
                <div className="mt-3 flex max-w-xl flex-col gap-4">
                  <TextField
                    label={m.complaint_resolution()}
                    value={resolution}
                    maxLength={500}
                    onChange={(event) => setResolution(event.target.value)}
                  />
                  <TextField
                    label={m.complaint_compensation()}
                    hint={m.complaint_compensation_hint()}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={compensation}
                    onChange={(event) => setCompensation(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={busy || resolution.trim() === '' || !(Number(compensation || 0) >= 0)}
                      onClick={() =>
                        void run(
                          () =>
                            closeComplaint({
                              data: {
                                complaintId: complaint.complaintId,
                                resolution,
                                compensation: Math.round(Number(compensation || 0)),
                              },
                            }),
                          m.complaint_closed({ number: complaint.orderNumber }),
                        ).then((done) => done && setClosing(null))
                      }
                    >
                      {m.complaint_close()}
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setClosing(null)}>
                      {m.action_cancel()}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {closed.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1.5 text-body-sm">
          {closed.map((complaint) => (
            <li key={complaint.complaintId} className="flex flex-wrap items-baseline gap-x-3">
              <Tag tone="validated">{m.complaint_status_resolved()}</Tag>
              <span>
                {complaintWords[complaint.kind]()} · {complaint.orderNumber}
              </span>
              <span className="text-fg-muted">
                {complaint.resolution}
                {complaint.compensation > 0 && ` — ${formatMoney(complaint.compensation)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </PageSection>
  );
}

/** The deposits nobody comes back for: the fee the laundry decided, the warning, the way out. */
export function Unclaimed({ view, mayRule, first }: { view: UnclaimedView; mayRule: boolean; first: boolean }) {
  const { busy, run, notes } = useGesture();
  const [releasing, setReleasing] = useState<string | null>(null);
  const [destination, setDestination] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [rules, setRules] = useState({
    freeDays: String(view.rules.freeDays),
    feePerDay: String(view.rules.feePerDay),
    abandonDays: String(view.rules.abandonDays),
    quickSwitch: view.rules.quickSwitch,
  });
  const chosen = view.deposits.find((deposit) => deposit.orderId === releasing);
  const whole = (text: string) => (/^\d+$/.test(text.trim()) ? Number(text) : null);
  const typed = { freeDays: whole(rules.freeDays), feePerDay: whole(rules.feePerDay), abandonDays: whole(rules.abandonDays) };
  return (
    <PageSection first={first} title={m.unclaimed_title()}>
      {notes}
      {view.deposits.length === 0 ? (
        <p className="text-fg-muted">{m.unclaimed_none({ days: view.rules.freeDays })}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.deposits.map((deposit) => (
            <li key={deposit.orderId} className={box}>
              <p>
                <OrderLink orderId={deposit.orderId} number={deposit.number} customer={deposit.customerName} />
              </p>
              <p className="mt-1">
                {m.unclaimed_days({ days: deposit.days })}
                {deposit.balance > 0 && ` · ${m.order_balance_of({ amount: formatMoney(deposit.balance) })}`}
              </p>
              <p className="text-body-sm text-fg-muted">
                {deposit.noticedAt ? m.unclaimed_noticed({ date: formatDay(deposit.noticedAt) }) : m.unclaimed_not_noticed()}
                {deposit.charged > 0 && ` · ${m.unclaimed_charged({ amount: formatMoney(deposit.charged) })}`}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {deposit.feeDue > 0 && !deposit.invoiced && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => chargeStorage({ data: { orderId: deposit.orderId } }),
                        m.unclaimed_fee_charged({ amount: formatMoney(deposit.feeDue), number: deposit.number }),
                      )
                    }
                  >
                    {m.unclaimed_charge({ amount: formatMoney(deposit.feeDue) })}
                  </Button>
                )}
                {!deposit.noticedAt && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () => warnCustomer({ data: { orderId: deposit.orderId } }),
                        m.unclaimed_warned({ number: deposit.number, days: view.rules.abandonDays }),
                      )
                    }
                  >
                    {m.unclaimed_warn()}
                  </Button>
                )}
                {deposit.mayRelease && releasing !== deposit.orderId && (
                  <Button
                    variant="secondary"
                    disabled={busy}
                    onClick={() => {
                      setReleasing(deposit.orderId);
                      setDestination('');
                    }}
                  >
                    {m.unclaimed_release()}
                  </Button>
                )}
              </div>
              {releasing === deposit.orderId && (
                <div className="mt-3 flex max-w-xl flex-col gap-4">
                  <TextField
                    label={m.unclaimed_destination()}
                    hint={m.unclaimed_destination_hint()}
                    value={destination}
                    maxLength={300}
                    onChange={(event) => setDestination(event.target.value)}
                  />
                  <div className="flex flex-wrap gap-3">
                    <Button disabled={busy || destination.trim() === ''} onClick={() => setConfirming(true)}>
                      {m.unclaimed_release()}
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setReleasing(null)}>
                      {m.action_cancel()}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {mayRule && (
        <div className="mt-6 flex max-w-xl flex-col gap-4">
          <h3 className="font-heading text-title font-semibold">{m.rules_title()}</h3>
          <p className="text-body-sm text-fg-muted">{m.rules_hint()}</p>
          <TextField
            label={m.rules_free_days()}
            type="number"
            inputMode="numeric"
            min={0}
            value={rules.freeDays}
            onChange={(event) => setRules((current) => ({ ...current, freeDays: event.target.value }))}
          />
          <TextField
            label={m.rules_fee_per_day()}
            hint={m.rules_fee_per_day_hint()}
            type="number"
            inputMode="numeric"
            min={0}
            value={rules.feePerDay}
            onChange={(event) => setRules((current) => ({ ...current, feePerDay: event.target.value }))}
          />
          <TextField
            label={m.rules_abandon_days()}
            hint={m.rules_abandon_days_hint()}
            type="number"
            inputMode="numeric"
            min={7}
            value={rules.abandonDays}
            onChange={(event) => setRules((current) => ({ ...current, abandonDays: event.target.value }))}
          />
          <CheckField
            label={m.rules_quick_switch()}
            hint={m.rules_quick_switch_hint()}
            checked={rules.quickSwitch}
            onChange={(quickSwitch) => setRules((current) => ({ ...current, quickSwitch }))}
          />
          <div>
            <Button
              disabled={busy || typed.freeDays === null || typed.feePerDay === null || (typed.abandonDays ?? 0) < 7}
              onClick={() =>
                void run(
                  () =>
                    saveRules({
                      data: {
                        freeDays: typed.freeDays ?? 0,
                        feePerDay: typed.feePerDay ?? 0,
                        abandonDays: typed.abandonDays ?? 90,
                        quickSwitch: rules.quickSwitch,
                      },
                    }),
                  m.rules_saved(),
                )
              }
            >
              {m.rules_save()}
            </Button>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={confirming && chosen !== undefined}
        title={m.review_confirm_title()}
        confirmLabel={m.unclaimed_release()}
        cancelLabel={m.action_close()}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (!chosen) return;
          setConfirming(false);
          void run(
            () => releaseDeposit({ data: { orderId: chosen.orderId, destination } }),
            m.unclaimed_released({ number: chosen.number }),
          ).then((done) => done && setReleasing(null));
        }}
      >
        {chosen
          ? m.unclaimed_confirm({
              number: chosen.number,
              given: formatMoney(Math.max(0, chosen.balance)),
            })
          : ''}
      </ConfirmDialog>
    </PageSection>
  );
}

type Week = Record<number, { on: boolean; start: string; end: string }>;

const weekOf = (person: ScheduleView['people'][number]): Week =>
  Object.fromEntries(
    weekdayWords.map((_, weekday) => {
      const shift = person.week.find((day) => day.weekday === weekday);
      return [
        weekday,
        { on: shift !== undefined, start: clock(shift?.startMinute ?? 450), end: clock(shift?.endMinute ?? 1050) },
      ];
    }),
  );

/** Who is expected and when: each person's usual week, and who is late now. */
export function Schedule({ view, mayPlan, first }: { view: ScheduleView; mayPlan: boolean; first: boolean }) {
  const { busy, run, notes } = useGesture();
  const [editing, setEditing] = useState<string | null>(null);
  const [week, setWeek] = useState<Week>({});
  const days = Object.entries(week)
    .filter(([, day]) => day.on)
    .map(([weekday, day]) => ({
      weekday: Number(weekday),
      startMinute: minuteOf(day.start),
      endMinute: minuteOf(day.end),
    }));
  const valid = days.every(
    (day) => day.startMinute !== null && day.endMinute !== null && day.endMinute > day.startMinute,
  );
  return (
    <PageSection first={first} title={m.schedule_title()}>
      {notes}
      {view.people.length === 0 ? (
        <p className="text-fg-muted">{m.work_nobody()}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {view.people.map((person) => (
            <li key={person.userId} className={box}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="font-heading text-title font-semibold">{person.name}</span>
                <span className="flex flex-wrap items-center gap-2 text-body-sm">
                  {person.late !== null && <Tag tone="error">{m.schedule_late({ minutes: person.late })}</Tag>}
                  <span className="text-fg-muted">
                    {person.expected
                      ? m.schedule_today({ start: clock(person.expected.startMinute), end: clock(person.expected.endMinute) })
                      : m.schedule_day_off()}
                  </span>
                </span>
              </div>
              {editing !== person.userId && (
                <>
                  <p className="mt-1 text-body-sm text-fg-muted">
                    {person.week.length === 0
                      ? m.schedule_no_week()
                      : person.week
                          .map(
                            (day) =>
                              `${(weekdayWords[day.weekday] ?? weekdayWords[0]!)()} ${clock(day.startMinute)}–${clock(day.endMinute)}`,
                          )
                          .join(' · ')}
                  </p>
                  {mayPlan && (
                    <div className="mt-3">
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() => {
                          setEditing(person.userId);
                          setWeek(weekOf(person));
                        }}
                      >
                        {m.schedule_edit({ name: person.name })}
                      </Button>
                    </div>
                  )}
                </>
              )}
              {editing === person.userId && (
                <div className="mt-3 flex flex-col gap-3">
                  {weekdayWords.map((label, weekday) => {
                    const day = week[weekday] ?? { on: false, start: '07:30', end: '17:30' };
                    const change = (patch: Partial<typeof day>) =>
                      setWeek((current) => ({ ...current, [weekday]: { ...day, ...patch } }));
                    return (
                      <div key={weekday} className="flex flex-wrap items-end gap-3">
                        <div className="w-40">
                          <CheckField label={label()} checked={day.on} onChange={(on) => change({ on })} />
                        </div>
                        {day.on && (
                          <>
                            <TextField
                              className="w-28"
                              label={m.schedule_start({ day: label() })}
                              type="time"
                              value={day.start}
                              onChange={(event) => change({ start: event.target.value })}
                            />
                            <TextField
                              className="w-28"
                              label={m.schedule_end({ day: label() })}
                              type="time"
                              value={day.end}
                              onChange={(event) => change({ end: event.target.value })}
                            />
                          </>
                        )}
                      </div>
                    );
                  })}
                  <div className="flex flex-wrap gap-3">
                    <Button
                      disabled={busy || !valid}
                      onClick={() =>
                        void run(
                          () =>
                            saveWeek({
                              data: {
                                userId: person.userId,
                                days: days.map((day) => ({
                                  weekday: day.weekday,
                                  startMinute: day.startMinute ?? 0,
                                  endMinute: day.endMinute ?? 0,
                                })),
                              },
                            }),
                          m.schedule_saved({ name: person.name }),
                        ).then((done) => done && setEditing(null))
                      }
                    >
                      {m.action_save()}
                    </Button>
                    <Button variant="secondary" disabled={busy} onClick={() => setEditing(null)}>
                      {m.action_cancel()}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 max-w-3xl text-body-sm text-fg-muted">{m.schedule_how()}</p>
    </PageSection>
  );
}
