import type { KeteIdentity } from '@kete/auth';
import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { Invoice } from '../src/features/invoices';
import { decisionIn } from '../src/features/manager/by-messaging';
import type { AskedApproval, ScheduleView, UnclaimedView } from '../src/features/manager/capabilities';
import {
  checkCode,
  checkRequest,
  checkShift,
  expectedOn,
  latenessOf,
  LOCK_MINUTES,
  MAX_FAILURES,
  mayRelease,
  storageFee,
  weekdayOf,
  type Shift,
} from '../src/features/manager/domain/manager';
import { saveCode, verifyCode, type Complaint } from '../src/features/manager/infrastructure/manager.tables';
import type { Channels, CustomerChannel } from '../src/features/messaging/ports';
import type { Order } from '../src/features/orders';
import { ACTING_COOKIE, actingOn, forgetSwitchRule, signActing } from '../src/platform/acting';
import { useChannels } from '../src/platform/channels';
import { transaction } from '../src/platform/db';
import { decisionHeard, tellDecidersOf } from '../src/platform/decisions';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// What lets a site run without its owner (specs/025-manager): the usual week and who is late, what
// a clerk may only ask for, complaints, deposits nobody comes back for, a personal code.

const code = (work: () => void): string | null => {
  try {
    work();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'thrown';
  }
};
const at = (iso: string) => new Date(iso);

describe('a manager’s rules, pure functions', () => {
  it('a week starts on Monday; a shift ends after it starts', () => {
    expect(weekdayOf(at('2026-10-05T10:00:00Z'))).toBe(0);
    expect(weekdayOf(at('2026-10-09T10:00:00Z'))).toBe(4);
    expect(weekdayOf(at('2026-10-11T23:59:00Z'))).toBe(6);
    expect(code(() => checkShift({ startMinute: 450, endMinute: 1050 }))).toBeNull();
    expect(code(() => checkShift({ startMinute: 600, endMinute: 600 }))).toBe('shift_invalid');
    expect(code(() => checkShift({ startMinute: 600, endMinute: 1441 }))).toBe('shift_invalid');
    expect(code(() => checkShift({ startMinute: 7.5, endMinute: 600 }))).toBe('shift_invalid');
  });

  it('late is: expected, her hour passed, not clocked in — never a guess', () => {
    const shifts: Shift[] = [{ userId: 'usr_yao', weekday: 4, startMinute: 450, endMinute: 1050 }];
    const friday = at('2026-10-09T08:10:00Z');
    const expected = expectedOn(shifts, 'usr_yao', friday);
    expect(expected).toEqual({ startMinute: 450, endMinute: 1050 });
    expect(expectedOn(shifts, 'usr_yao', at('2026-10-10T08:10:00Z'))).toBeNull();
    expect(expectedOn(shifts, 'usr_ama', friday)).toBeNull();
    expect(latenessOf({ expected, cameToday: false, now: friday })).toBe(40);
    expect(latenessOf({ expected, cameToday: true, now: friday })).toBeNull();
    expect(latenessOf({ expected, cameToday: false, now: at('2026-10-09T07:00:00Z') })).toBeNull();
    // After her day, nobody is « late » any more: she did not come.
    expect(latenessOf({ expected, cameToday: false, now: at('2026-10-09T18:00:00Z') })).toBeNull();
    expect(latenessOf({ expected: null, cameToday: false, now: friday })).toBeNull();
  });

  it('a request is checked against the deposit: its state, what was paid, its price', () => {
    const order = { status: 'received', total: 2_000, paid: 600, discount: 0 };
    const ask = (kind: 'discount' | 'cancel' | 'refund', amount: number, over = {}) =>
      code(() => checkRequest({ kind, amount, reason: 'Cliente fidèle' }, { ...order, ...over }));
    expect(ask('discount', 500)).toBeNull();
    expect(ask('discount', 0)).toBe('amount_invalid');
    expect(ask('discount', 2_001)).toBe('amount_invalid');
    // A discount never brings the price under what was already paid.
    expect(ask('discount', 1_500)).toBe('refund_first');
    // A second discount replaces the first: it is measured on the price before any.
    expect(ask('discount', 1_400, { total: 1_500, discount: 500 })).toBeNull();
    expect(ask('refund', 600)).toBeNull();
    expect(ask('refund', 601)).toBe('refund_above_paid');
    expect(ask('cancel', 0)).toBeNull();
    expect(ask('cancel', 0, { status: 'collected' })).toBe('order_not_open');
    expect(ask('discount', 100, { status: 'collected' })).toBe('order_not_open');
    expect(ask('refund', 100, { status: 'cancelled' })).toBe('order_cancelled');
    expect(code(() => checkRequest({ kind: 'cancel', amount: 0, reason: '  ' }, order))).toBe('reason_needed');
  });

  it('a storage fee is the laundry’s: days beyond the free ones, minus what was charged', () => {
    const now = at('2026-10-09T12:00:00Z');
    const readyAt = at('2026-08-30T10:00:00Z'); // 40 days
    const rules = { freeDays: 30, feePerDay: 100, abandonDays: 90 };
    expect(storageFee({ readyAt, now, rules, alreadyCharged: 0 })).toEqual({ days: 40, billableDays: 10, due: 1_000 });
    expect(storageFee({ readyAt, now, rules, alreadyCharged: 400 }).due).toBe(600);
    expect(storageFee({ readyAt, now, rules, alreadyCharged: 5_000 }).due).toBe(0);
    // No fee decided: nothing is ever charged.
    expect(storageFee({ readyAt, now, rules: { ...rules, feePerDay: 0 }, alreadyCharged: 0 }).due).toBe(0);
    expect(storageFee({ readyAt: now, now, rules, alreadyCharged: 0 })).toEqual({ days: 0, billableDays: 0, due: 0 });
  });

  it('a deposit leaves only after its customer was warned, and the delay ran out', () => {
    const now = at('2026-10-09T12:00:00Z');
    const rules = { freeDays: 30, feePerDay: 0, abandonDays: 90 };
    expect(mayRelease({ noticedAt: null, now, rules })).toBe(false);
    expect(mayRelease({ noticedAt: at('2026-07-12T12:00:00Z'), now, rules })).toBe(false); // 89 days
    expect(mayRelease({ noticedAt: at('2026-07-11T12:00:00Z'), now, rules })).toBe(true); // 90 days
  });

  it('a decision by message is « OUI 12 » or « NON 12 », and nothing else', () => {
    expect(decisionIn('OUI 12')).toEqual({ approve: true, code: 12 });
    expect(decisionIn(' oui #12. ')).toEqual({ approve: true, code: 12 });
    expect(decisionIn('ok 3')).toEqual({ approve: true, code: 3 });
    expect(decisionIn('Non 12')).toEqual({ approve: false, code: 12 });
    expect(decisionIn('NO 7')).toEqual({ approve: false, code: 7 });
    for (const other of ['oui', '12', 'oui pour la 12', 'Bonjour', 'non merci', 'oui 12 et 13']) {
      expect(decisionIn(other)).toBeNull();
    }
  });

  it('a personal code is six digits, and not one anybody would try first', () => {
    expect(code(() => checkCode('482913'))).toBeNull();
    for (const short of ['1234', '12345a', '1234567', '']) expect(code(() => checkCode(short))).toBe('code_invalid');
    for (const simple of ['000000', '777777', '123456', '654321', '890123']) {
      expect(code(() => checkCode(simple))).toBe('code_too_simple');
    }
  });
});

describe('a site that runs without its owner', () => {
  let db: TestSchema;
  let site: Site;
  let read: Catalog;
  const afi = person('usr_afi', 'owner');
  const kossi = person('usr_kossi', 'member'); // manager
  const mawuli = person('usr_mawuli', 'member'); // counter
  const yao = person('usr_yao', 'member'); // workshop
  const orders: Record<string, string> = {};
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId;
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? null;
  const receive = async (key: string, phone: string, name: string) => {
    const { orderId } = await done<{ orderId: string }>(afi, 'orders_receive', {
      siteId: site.siteId,
      phone,
      customerName: name,
      lines: [{ serviceId: service('Lavage et repassage'), articleId: article('Chemise'), quantity: 4 }],
    });
    orders[key] = orderId;
  };
  const order = (key: string) => done<Order>(afi, 'orders_get', { orderId: orders[key] });
  const sql = (text: string, values: unknown[] = []) => transaction('org_acme', (client) => client.query(text, values));
  /** The deposit is ready since `days`: what a test cannot wait for. */
  const readySince = (key: string, days: number) =>
    sql(`update orders set status = 'ready', ready_at = now() - make_interval(days => $2) where order_id = $1`, [
      orders[key],
      days,
    ]);
  const approvals = (who: KeteIdentity) =>
    done<{ approvals: AskedApproval[]; mayDecide: boolean }>(who, 'approvals_list', {});
  const ask = (who: KeteIdentity, input: Record<string, unknown>) =>
    act<{ approvalId: string; number: string }>(who, 'approvals_request', input);
  const unclaimed = () => done<UnclaimedView>(kossi, 'unclaimed_list', {});

  beforeAll(async () => {
    process.env.SESSION_SECRET ??= 'a-test-secret-of-at-least-thirty-two-characters';
    process.env.PUBLIC_URL ??= 'http://localhost:3402';
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'starting',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    site = (await done<{ sites: Site[] }>(afi, 'business_overview', {})).sites[0] as Site;
    read = await done<Catalog>(afi, 'catalog_read', {});
    await done(afi, 'catalog_set_price', {
      serviceId: service('Lavage et repassage'),
      articleId: article('Chemise'),
      amount: 500,
    });
    await hire(afi, 'owner');
    await hire(kossi, 'manager');
    await hire(mawuli, 'counter');
    await hire(yao, 'workshop');
    for (const key of ['d1', 'd2', 'd3', 'd4', 'd5', 'd6']) await receive(key, '90 12 34 56', 'Mme Adjovi'); // 2 000 each
  }, 300_000);

  afterAll(async () => {
    useChannels(undefined);
    await db.drop();
  });

  it('the usual week is set by who plans; the days left out are days off', async () => {
    const allWeek = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 0, endMinute: 1440 }));
    expect(await act(mawuli, 'schedule_set_week', { userId: yao.userId, days: allWeek })).toEqual({
      ok: false,
      code: 'not_allowed',
    });
    expect(await done(kossi, 'schedule_set_week', { userId: yao.userId, days: allWeek })).toMatchObject({ days: 7 });
    const twice = [allWeek[0], allWeek[0]];
    expect(await act(kossi, 'schedule_set_week', { userId: yao.userId, days: twice })).toEqual({
      ok: false,
      code: 'shift_invalid',
    });
    expect(
      await act(kossi, 'schedule_set_week', { userId: yao.userId, days: [{ weekday: 1, startMinute: 600, endMinute: 540 }] }),
    ).toEqual({ ok: false, code: 'shift_invalid' });
    expect(await act(kossi, 'schedule_set_week', { userId: 'usr_nobody', days: [] })).toEqual({
      ok: false,
      code: 'not_found',
    });
    await done(kossi, 'schedule_set_week', { userId: mawuli.userId, days: [] });
    const { people } = await done<ScheduleView>(kossi, 'schedule_read', {});
    const of = (who: KeteIdentity) => people.find((line) => line.userId === who.userId);
    expect(of(yao)).toMatchObject({ expected: { startMinute: 0, endMinute: 1440 } });
    expect(of(yao)?.week).toHaveLength(7);
    expect(of(mawuli)).toMatchObject({ expected: null, late: null, week: [] });
    // Once she clocked in, she is not late — whatever the hour.
    await done(yao, 'presence_clock_in', {});
    const after = await done<ScheduleView>(kossi, 'schedule_read', {});
    expect(after.people.find((line) => line.userId === yao.userId)?.late).toBeNull();
    // An agent prepares a week; it never sets one.
    const prepared = await asPerson(kossi, () =>
      registry.invoke({ ...agentFor(kossi), name: 'schedule_set_week', input: { userId: yao.userId, days: [] } }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect((await done<ScheduleView>(kossi, 'schedule_read', {})).people.find((l) => l.userId === yao.userId)?.week).toHaveLength(7);
  }, 120_000);

  it('a clerk asks for a discount; nothing changes until a manager grants it', async () => {
    const asked = await ask(mawuli, { kind: 'discount', orderId: orders.d1, amount: 500, reason: 'Cliente fidèle' });
    expect(asked).toMatchObject({ ok: true });
    if (!asked.ok) return;
    expect(await order('d1')).toMatchObject({ total: 2_000, discount: 0 });
    // She reads her own request; she does not decide.
    const hers = await approvals(mawuli);
    expect(hers.mayDecide).toBe(false);
    expect(hers.approvals).toHaveLength(1);
    const decide = { approvalId: asked.output.approvalId, approve: true };
    expect(await act(mawuli, 'approvals_decide', decide)).toEqual({ ok: false, code: 'not_allowed' });
    // An agent prepares the decision; the manager makes it.
    const prepared = await asPerson(kossi, () =>
      registry.invoke({ ...agentFor(kossi), name: 'approvals_decide', input: decide }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect(await order('d1')).toMatchObject({ total: 2_000, discount: 0 });
    const theirs = await approvals(kossi);
    expect(theirs.mayDecide).toBe(true);
    expect(theirs.approvals[0]).toMatchObject({ kind: 'discount', amount: 500, status: 'pending', requestedByName: 'usr_mawuli' });
    expect(await done(kossi, 'approvals_decide', decide)).toMatchObject({ approved: true, kind: 'discount' });
    expect(await order('d1')).toMatchObject({ total: 1_500, discount: 500, discountReason: 'Cliente fidèle' });
    expect(await act(kossi, 'approvals_decide', decide)).toEqual({ ok: false, code: 'already_decided' });
    expect((await approvals(mawuli)).approvals[0]).toMatchObject({ status: 'approved' });
    expect((await order('d1')).events.map((event) => event.kind)).toContain('discount');
  }, 120_000);

  it('refused, the deposit does not change; granted, a cancellation is done at once', async () => {
    const cancel = { kind: 'cancel', orderId: orders.d2, reason: 'Le client a repris son linge' };
    const first = await ask(mawuli, cancel);
    if (!first.ok) throw new Error(first.code);
    expect(await done(kossi, 'approvals_decide', { approvalId: first.output.approvalId, approve: false, note: 'À voir' })).toMatchObject({
      approved: false,
    });
    expect(await order('d2')).toMatchObject({ status: 'received' });
    const second = await ask(mawuli, cancel);
    if (!second.ok) throw new Error(second.code);
    await done(kossi, 'approvals_decide', { approvalId: second.output.approvalId, approve: true });
    expect(await order('d2')).toMatchObject({ status: 'cancelled', cancelReason: 'Le client a repris son linge' });
    // Nothing more may be asked on a cancelled deposit.
    expect(await ask(mawuli, { kind: 'discount', orderId: orders.d2, amount: 100, reason: 'x' })).toEqual({
      ok: false,
      code: 'order_cancelled',
    });
    expect(await ask(yao, cancel)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await ask(mawuli, { ...cancel, orderId: 'ord_unknown' })).toEqual({ ok: false, code: 'not_found' });
  }, 120_000);

  it('a refund is granted under the deposit’s own rules, checked again when it is decided', async () => {
    await done(afi, 'payments_record', { orderId: orders.d3, amount: 1_000, method: 'mobile_money' });
    expect(await ask(mawuli, { kind: 'refund', orderId: orders.d3, amount: 1_001, method: 'mobile_money', reason: 'Trop perçu' })).toEqual({
      ok: false,
      code: 'refund_above_paid',
    });
    expect(await ask(mawuli, { kind: 'refund', orderId: orders.d3, amount: 400, reason: 'Trop perçu' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    const refund = await ask(mawuli, { kind: 'refund', orderId: orders.d3, amount: 400, method: 'mobile_money', reason: 'Trop perçu' });
    if (!refund.ok) throw new Error(refund.code);
    await done(kossi, 'approvals_decide', { approvalId: refund.output.approvalId, approve: true });
    expect(await order('d3')).toMatchObject({ paid: 600 });
    // Asked while it was possible, decided after the deposit changed: the rule speaks, nothing moves.
    const discount = await ask(mawuli, { kind: 'discount', orderId: orders.d4, amount: 1_000, reason: 'Geste' });
    if (!discount.ok) throw new Error(discount.code);
    await done(afi, 'payments_record', { orderId: orders.d4, amount: 1_500, method: 'mobile_money' });
    expect(await act(kossi, 'approvals_decide', { approvalId: discount.output.approvalId, approve: true })).toEqual({
      ok: false,
      code: 'refund_first',
    });
    expect(await order('d4')).toMatchObject({ total: 2_000, discount: 0, paid: 1_500 });
    const still = (await approvals(kossi)).approvals.find((a) => a.approvalId === discount.output.approvalId);
    expect(still).toMatchObject({ status: 'pending' });
  }, 120_000);

  it('a complaint is opened at the counter and closed by a manager, with what the laundry gives', async () => {
    const complaint = { orderId: orders.d1, kind: 'stain', description: 'Tache de vin restée sur une chemise' };
    expect(await act(yao, 'complaints_open', complaint)).toEqual({ ok: false, code: 'not_allowed' });
    const { complaintId } = await done<{ complaintId: string }>(mawuli, 'complaints_open', complaint);
    const close = { complaintId, resolution: 'Chemise relavée, geste commercial', compensation: 1_000 };
    expect(await act(mawuli, 'complaints_close', close)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await done(kossi, 'complaints_close', close)).toMatchObject({ compensation: 1_000 });
    expect(await act(kossi, 'complaints_close', close)).toEqual({ ok: false, code: 'not_found' });
    const { complaints } = await done<{ complaints: Complaint[] }>(kossi, 'complaints_list', {});
    expect(complaints).toHaveLength(1);
    expect(complaints[0]).toMatchObject({
      kind: 'stain',
      status: 'resolved',
      compensation: 1_000,
      resolution: 'Chemise relavée, geste commercial',
      customerName: 'Mme Adjovi',
    });
    expect((await order('d1')).events.map((event) => event.kind)).toContain('complaint');
  }, 120_000);

  it('a storage fee follows the laundry’s rules — none until it decides one', async () => {
    await readySince('d5', 40);
    await readySince('d6', 12);
    // By default: thirty free days and no fee. The deposit sleeps; nothing is owed for it.
    const before = await unclaimed();
    expect(before.rules).toEqual({ freeDays: 30, feePerDay: 0, abandonDays: 90, quickSwitch: false });
    expect(before.deposits.map((deposit) => deposit.number)).toHaveLength(1);
    expect(before.deposits[0]).toMatchObject({ days: 40, feeDue: 0, noticedAt: null, mayRelease: false });
    expect(await act(kossi, 'unclaimed_charge', { orderId: orders.d5 })).toEqual({ ok: false, code: 'no_storage_fee' });
    const rules = { freeDays: 10, feePerDay: 100, abandonDays: 7, quickSwitch: true };
    expect(await act(kossi, 'unclaimed_set_rules', rules)).toEqual({ ok: false, code: 'not_allowed' });
    await done(afi, 'unclaimed_set_rules', rules);
    const after = await unclaimed();
    expect(after.deposits.map((deposit) => [deposit.days, deposit.feeDue])).toEqual([
      [40, 3_000],
      [12, 200],
    ]);
    expect(await act(mawuli, 'unclaimed_charge', { orderId: orders.d5 })).toEqual({ ok: false, code: 'not_allowed' });
    expect(await done(kossi, 'unclaimed_charge', { orderId: orders.d5 })).toMatchObject({ amount: 3_000, days: 30 });
    expect(await order('d5')).toMatchObject({ total: 5_000, storageAmount: 3_000 });
    // Charged once: the same days are never charged twice.
    expect(await act(kossi, 'unclaimed_charge', { orderId: orders.d5 })).toEqual({ ok: false, code: 'no_storage_fee' });
    expect(await act(kossi, 'unclaimed_charge', { orderId: orders.d1 })).toEqual({ ok: false, code: 'order_not_ready' });
  }, 120_000);

  it('on an invoice the storage fee says its name, and the lines still add up', async () => {
    await done(kossi, 'unclaimed_charge', { orderId: orders.d6 });
    const issued = await done<{ invoiceId: string; total: number }>(afi, 'invoices_issue', { orderIds: [orders.d6] });
    expect(issued.total).toBe(2_200);
    const { invoice } = await done<{ invoice: Invoice }>(afi, 'invoices_get', { invoiceId: issued.invoiceId });
    expect(invoice.lines.map((line) => [line.kind, line.amount])).toEqual([
      ['item', 2_000],
      ['storage', 200],
    ]);
    expect(invoice.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(invoice.total);
    // An invoice is written once: nothing more is charged behind it.
    await sql(`update orders set ready_at = ready_at - interval '5 days' where order_id = $1`, [orders.d6]);
    expect(await act(kossi, 'unclaimed_charge', { orderId: orders.d6 })).toEqual({ ok: false, code: 'already_invoiced' });
  }, 120_000);

  it('an unclaimed deposit leaves only after its warning and the delay; what was owed is given up', async () => {
    const release = { orderId: orders.d5, destination: 'Donné à l’orphelinat d’Agoè' };
    expect(await act(kossi, 'unclaimed_release', release)).toEqual({ ok: false, code: 'release_too_early' });
    expect(await done(kossi, 'unclaimed_warn', { orderId: orders.d5 })).toMatchObject({ number: expect.any(String) });
    expect(await act(kossi, 'unclaimed_warn', { orderId: orders.d5 })).toEqual({ ok: false, code: 'already_noticed' });
    expect(await act(kossi, 'unclaimed_release', release)).toEqual({ ok: false, code: 'release_too_early' });
    await sql(`update abandon_notices set noticed_at = now() - interval '8 days' where order_id = $1`, [orders.d5]);
    expect((await unclaimed()).deposits.find((deposit) => deposit.orderId === orders.d5)).toMatchObject({ mayRelease: true });
    await done(afi, 'payments_record', { orderId: orders.d5, amount: 1_000, method: 'mobile_money' });
    // An agent prepares the release; it never takes clothes out.
    const prepared = await asPerson(kossi, () =>
      registry.invoke({ ...agentFor(kossi), name: 'unclaimed_release', input: release }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect(await order('d5')).toMatchObject({ status: 'ready' });
    expect(await act(mawuli, 'unclaimed_release', release)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await done(kossi, 'unclaimed_release', release)).toMatchObject({ givenUp: 4_000 });
    // What was paid stays earned; nothing stays owed on clothes that are gone.
    const gone = await order('d5');
    expect(gone).toMatchObject({ status: 'collected', total: 1_000, paid: 1_000, discount: 4_000, discountReason: release.destination });
    expect(gone.events.map((event) => event.kind)).toEqual(expect.arrayContaining(['storage_fee', 'abandon_notice', 'released']));
    expect((await unclaimed()).deposits.map((deposit) => deposit.orderId)).not.toContain(orders.d5);
    // The invoiced deposit still claims its money: its invoice is cancelled first.
    await done(kossi, 'unclaimed_warn', { orderId: orders.d6 });
    await sql(`update abandon_notices set noticed_at = now() - interval '8 days' where order_id = $1`, [orders.d6]);
    expect(await act(kossi, 'unclaimed_release', { ...release, orderId: orders.d6 })).toEqual({
      ok: false,
      code: 'already_invoiced',
    });
  }, 120_000);

  it('those who decide are told on WhatsApp and Telegram, and answer by message', async () => {
    const sent: { channel: string; to: string; text: string }[] = [];
    const fake = (channel: 'whatsapp' | 'telegram'): CustomerChannel => ({
      channel,
      async sendText(to, body) {
        sent.push({ channel, to, text: body });
      },
      async sendDocument() {},
    });
    const connected: Channels = { whatsapp: fake('whatsapp'), telegram: fake('telegram') };
    useChannels(connected);
    const tie = (who: KeteIdentity, telegram: string | null, whatsapp: string | null) =>
      sql(
        `insert into staff_messaging (organization_id, user_id, link_token, telegram_chat_id, whatsapp_phone)
         values ('org_acme', $1, $2, $3, $4)`,
        [who.userId, `ask_${who.userId}_token`, telegram, whatsapp],
      );
    await tie(kossi, '555', '22890000001');
    await tie(mawuli, '777', null);
    // What was asked before anyone tied an address is not said late.
    await transaction('org_acme', (client) => tellDecidersOf(client));
    sent.length = 0;

    const asked = await ask(mawuli, { kind: 'discount', orderId: orders.d3, amount: 300, reason: 'Retard de notre part' });
    if (!asked.ok) throw new Error(asked.code);
    const mine = (await approvals(kossi)).approvals.find((a) => a.approvalId === asked.output.approvalId);
    const code = mine?.replyCode ?? 0;
    expect(code).toBeGreaterThan(0);
    // The manager is told on both her channels; whoever asked is not told about her own request.
    expect(await transaction('org_acme', (client) => tellDecidersOf(client))).toBe(2);
    expect(sent.map((message) => [message.channel, message.to])).toEqual([
      ['whatsapp', '22890000001'],
      ['telegram', '555'],
    ]);
    expect(sent[0]?.text).toContain(`OUI ${code}`);
    expect(sent[0]?.text).toContain('Retard de notre part');
    expect(sent[0]?.text).toMatch(/Remise 300\sF\sCFA sur le dépôt A-0003/);
    // Told once.
    expect(await transaction('org_acme', (client) => tellDecidersOf(client))).toBe(0);
    sent.length = 0;

    // Not a decision, or not from a tied address: the message is read as any other.
    expect(await decisionHeard({ channel: 'whatsapp', sender: '22890000001', text: 'Bonjour' })).toBe(false);
    expect(await decisionHeard({ channel: 'telegram', sender: '999', text: `OUI ${code}` })).toBe(false);
    // The clerk who asked cannot grant herself, even by message.
    expect(await decisionHeard({ channel: 'telegram', sender: '777', text: `OUI ${code}` })).toBe(true);
    expect(sent.pop()?.text).toContain('Vous n’avez pas le droit de faire cela.');
    expect(await order('d3')).toMatchObject({ discount: 0 });
    expect(await decisionHeard({ channel: 'telegram', sender: '555', text: 'non 9999' })).toBe(true);
    expect(sent.pop()?.text).toContain('9999');
    // Her « OUI 12 » is her decision: done at once, answered on the channel she wrote from.
    expect(await decisionHeard({ channel: 'whatsapp', sender: '22890000001', text: `oui ${code}` })).toBe(true);
    expect(sent.pop()).toMatchObject({ channel: 'whatsapp', to: '22890000001' });
    expect(await order('d3')).toMatchObject({ discount: 300, total: 1_700, discountReason: 'Retard de notre part' });
    expect((await approvals(kossi)).approvals.find((a) => a.approvalId === asked.output.approvalId)).toMatchObject({
      status: 'approved',
    });
    // Decided once: the same answer again finds nothing waiting.
    expect(await decisionHeard({ channel: 'telegram', sender: '555', text: `OUI ${code}` })).toBe(true);
    expect(sent.pop()?.text).toContain(String(code));
    expect(await order('d3')).toMatchObject({ discount: 300, total: 1_700 });
    useChannels(undefined);
  }, 180_000);

  it('a personal code is kept as a hash, and locks after a few wrong tries', async () => {
    const limits = { maxFailures: MAX_FAILURES, lockMinutes: LOCK_MINUTES };
    const check = (userId: string, given: string) => transaction('org_acme', (client) => verifyCode(client, userId, given, limits));
    expect(await check(mawuli.userId, '482913')).toBe('none');
    await transaction('org_acme', (client) => saveCode(client, 'org_acme', mawuli.userId, '482913'));
    const stored = await sql(`select code_hash from staff_codes where user_id = $1`, [mawuli.userId]);
    expect(String(stored.rows[0]?.code_hash)).not.toContain('482913');
    expect(await check(mawuli.userId, '482913')).toBe('ok');
    for (let attempt = 1; attempt < MAX_FAILURES; attempt++) expect(await check(mawuli.userId, '111112')).toBe('wrong');
    expect(await check(mawuli.userId, '111112')).toBe('locked');
    // Locked: even the right code waits.
    expect(await check(mawuli.userId, '482913')).toBe('locked');
    await sql(`update staff_codes set locked_until = now() - interval '1 minute' where user_id = $1`, [mawuli.userId]);
    expect(await check(mawuli.userId, '482913')).toBe('ok');
    // A right code forgets the wrong ones before it.
    expect(await check(mawuli.userId, '111112')).toBe('wrong');
    expect(await check(mawuli.userId, '482913')).toBe('ok');
  }, 120_000);

  it('on a shared device, who acts is hers only on that session, in that laundry, while it is allowed', async () => {
    const token = await signActing({
      organizationId: 'org_acme',
      userId: mawuli.userId,
      name: 'Mawuli',
      deviceUserId: kossi.userId,
    });
    const asking = (value: string) =>
      new Request('http://localhost/aujourdhui', { headers: { cookie: `other=1; ${ACTING_COOKIE}=${value}` } });
    forgetSwitchRule();
    const acting = await actingOn(asking(token), kossi);
    // Her own rights decide — never the device owner's role at the Compte Kete.
    expect(acting).toMatchObject({ userId: mawuli.userId, name: 'Mawuli', organizationId: 'org_acme', role: 'member' });
    expect(await actingOn(asking(token), afi)).toBeNull();
    expect(await actingOn(asking(token), person('usr_kossi', 'owner', 'org_other'))).toBeNull();
    expect(await actingOn(asking(`${token.slice(0, -4)}AAAA`), kossi)).toBeNull();
    expect(await actingOn(new Request('http://localhost/aujourdhui'), kossi)).toBeNull();
    // With her rights, she asks; she does not decide — though the device is a manager's.
    if (!acting) return;
    expect(await act(acting, 'approvals_decide', { approvalId: 'apr_x', approve: true })).toEqual({ ok: false, code: 'not_allowed' });
    // The laundry turns the switch off: the cookie is worth nothing at once.
    await done(afi, 'unclaimed_set_rules', { freeDays: 10, feePerDay: 100, abandonDays: 7, quickSwitch: false });
    forgetSwitchRule('org_acme');
    expect(await actingOn(asking(token), kossi)).toBeNull();
  }, 120_000);

  it('one laundry’s schedules, requests, complaints, rules, fees, notices and codes are never another’s', async () => {
    const orderId = orders.d1;
    const rows: [string, (organizationId: string) => string][] = [
      ['shifts', (o) => `(organization_id, user_id, weekday, start_minute, end_minute) values ('${o}', 'usr_x', 0, 450, 1050)`],
      [
        'approvals',
        (o) =>
          `(approval_id, organization_id, kind, order_id, reason, requested_by, reply_code) values ('apr_${o}', '${o}', 'cancel', '${orderId}', 'x', 'usr_x', 1)`,
      ],
      [
        'complaints',
        (o) =>
          `(complaint_id, organization_id, order_id, kind, description, created_by) values ('cpl_${o}', '${o}', '${orderId}', 'other', 'x', 'usr_x')`,
      ],
      ['manager_rules', (o) => `(organization_id) values ('${o}')`],
      [
        'storage_fees',
        (o) => `(fee_id, organization_id, order_id, days, amount, applied_by) values ('stf_${o}', '${o}', '${orderId}', 1, 100, 'usr_x')`,
      ],
      ['abandon_notices', (o) => `(organization_id, order_id, noticed_by) values ('${o}', '${orderId}', 'usr_x')`],
      ['staff_codes', (o) => `(organization_id, user_id, code_hash) values ('${o}', 'usr_x', 'salt:hash')`],
    ];
    for (const [table, values] of rows) {
      await assertOrganizationIsolation({
        app: db.app,
        table,
        organizations: ['org_x', 'org_y'],
        insert: async (client, organizationId) => {
          await client.query(`insert into ${db.schema}.${table} ${values(organizationId)}`);
        },
      });
    }
  }, 300_000);
});
