import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { CashSession } from '../src/features/money';
import { chargesOf, monthPeriod, occurrences, type Charge } from '../src/features/money/domain/charges';
import {
  belowVariableCost,
  breakEven,
  completeCost,
  confidenceOf,
  contentCost,
  indexSheets,
  packMargins,
  periodResult,
  reconciliation,
  spreadFixed,
  variableCost,
  type CostSheet,
} from '../src/features/money/domain/costs';
import { cashGap, checkCashOut, checkTill, expectedCash } from '../src/features/money/domain/till';
import type { CostsView, ExpensesView, ResultView } from '../src/features/money/functions';
import type { Order } from '../src/features/orders';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// The money's proof (specs/003-money-day, 004-earn): the till falls right, everything that goes
// out counts once where it should, and what the laundry earns — pack by pack, on its real content
// — is computed by code, with what is not measured said.

const sheet = (over: Partial<CostSheet>): CostSheet => ({
  serviceId: 'svc_wash',
  articleId: 'art_shirt',
  laborMinutes: 6,
  consumablesCost: 120,
  machineCost: 40,
  measured: true,
  ...over,
});
const shirtSheet = sheet({});
const suitSheet = sheet({ articleId: 'art_suit', laborMinutes: 24, consumablesCost: 300, machineCost: 100 });
const fixedLabor = { laborIsVariable: false, laborMinuteCost: 5 };
const line = (articleId: string, quantity: number, covered = 0) => ({
  serviceId: 'svc_wash',
  articleId,
  quantity,
  covered,
});

describe('the till', () => {
  const flows = {
    openingFloat: 10_000,
    cashIn: 8_000,
    cashRefunds: 1_000,
    expenses: 2_500,
    draws: 3_000,
    bankDeposits: 5_000,
  };

  it('should hold its float, what came in, minus all that went out', () => {
    expect(expectedCash(flows)).toBe(6_500);
    expect(cashGap(6_000, flows)).toBe(-500);
    expect(cashGap(6_500, flows)).toBe(0);
  });

  it('a team works with an open till; someone alone may work without one', () => {
    expect(() => checkTill('team', false)).toThrow(/cash_session_needed/);
    expect(() => checkTill('team', true)).not.toThrow();
    expect(() => checkTill('solo', false)).not.toThrow();
  });

  it('cash cannot leave a till that does not hold it', () => {
    expect(() => checkCashOut(6_500, flows)).not.toThrow();
    expect(() => checkCashOut(6_501, flows)).toThrow(/cash_not_in_till/);
  });
});

describe('everything that goes out', () => {
  const rent: Charge = {
    spentOn: '2026-08-05',
    amount: 150_000,
    behavior: 'fixed',
    recurring: true,
    stoppedOn: null,
    voided: false,
  };
  const detergent: Charge = {
    spentOn: '2026-10-03',
    amount: 20_000,
    behavior: 'variable',
    recurring: false,
    stoppedOn: null,
    voided: false,
  };
  const october = monthPeriod('2026-10');

  it('a month is a period from its first day to the first day of the next', () => {
    expect(october).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(monthPeriod('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });

  it('a recurring charge counts every month from its start until it is stopped', () => {
    expect(occurrences(rent, monthPeriod('2026-07'))).toBe(0);
    expect(occurrences(rent, monthPeriod('2026-08'))).toBe(1);
    expect(occurrences(rent, october)).toBe(1);
    expect(occurrences(rent, { from: '2026-08-01', to: '2026-11-01' })).toBe(3);
    const stopped = { ...rent, stoppedOn: '2026-09-30' };
    expect(occurrences(stopped, monthPeriod('2026-09'))).toBe(1);
    expect(occurrences(stopped, october)).toBe(0);
  });

  it('a one-off expense counts in its period only; a voided one counts nowhere', () => {
    expect(occurrences(detergent, october)).toBe(1);
    expect(occurrences(detergent, monthPeriod('2026-09'))).toBe(0);
    expect(occurrences({ ...detergent, voided: true }, october)).toBe(0);
    expect(chargesOf([rent, detergent, { ...detergent, voided: true }], october)).toEqual({
      fixed: 150_000,
      variable: 20_000,
      total: 170_000,
    });
  });
});

describe('what things cost', () => {
  it('the variable cost of a piece: consumables and machine — and its minutes when paid by the piece', () => {
    expect(variableCost(shirtSheet, fixedLabor)).toBe(160);
    expect(variableCost(shirtSheet, { laborIsVariable: true, laborMinuteCost: 5 })).toBe(190);
  });

  it('spreads the fixed charges of the month over its pieces, by their minutes of work', () => {
    const sheets = indexSheets([shirtSheet, suitSheet]);
    const month = [line('art_shirt', 1000), line('art_suit', 250)];
    const spread = spreadFixed(300_000, month, sheets);
    expect(spread).toMatchObject({ minutes: 12_000, units: 1250, perMinute: 25 });
    expect(completeCost(shirtSheet, fixedLabor, spread)).toBe(160 + 150);
    expect(completeCost(suitSheet, fixedLabor, spread)).toBe(400 + 600);
  });

  it('spreads them equally when no minute is known', () => {
    const flat = sheet({ laborMinutes: 0 });
    const spread = spreadFixed(100_000, [line('art_shirt', 500)], indexSheets([flat]));
    expect(spread).toMatchObject({ minutes: 0, perUnit: 200 });
    expect(completeCost(flat, fixedLabor, spread)).toBe(360);
  });

  it('a piece with no sheet has no cost: it is counted apart, never guessed', () => {
    const sheets = indexSheets([shirtSheet]);
    const spread = spreadFixed(0, [line('art_shirt', 4)], sheets);
    const cost = contentCost([line('art_shirt', 4), line('art_dress', 2)], sheets, fixedLabor, spread);
    expect(cost).toMatchObject({ variable: 640, costed: 4, uncosted: 2 });
    expect(confidenceOf(cost)).toBe('partial');
    expect(confidenceOf({ costed: 0, uncosted: 3, estimated: 0 })).toBe('never');
    expect(confidenceOf({ costed: 3, uncosted: 0, estimated: 1 })).toBe('estimated');
    expect(confidenceOf({ costed: 3, uncosted: 0, estimated: 0 })).toBe('measured');
  });
});

describe('what each pack really earns', () => {
  // A 12-piece pack at 6 000. Its content: 8 shirts and 3 suits, all covered.
  const sheets = indexSheets([
    sheet({ consumablesCost: 150, machineCost: 50, laborMinutes: 5 }), // shirt: 200 variable
    sheet({ articleId: 'art_suit', consumablesCost: 500, machineCost: 200, laborMinutes: 20 }), // 700
  ]);
  const content = [line('art_shirt', 8, 8), line('art_suit', 3, 3)];
  // 100 minutes in the month, 201 000 of fixed charges: 2 010 a minute would be absurd — keep it
  // readable: the month is this one sale, 100 minutes, 2 010 of fixed charges → 20.1 a minute.
  const spread = spreadFixed(2_010, content, sheets);

  it('its price minus the complete cost of its real content', () => {
    const [pack] = packMargins(
      [{ packName: 'Business 12 pièces', packPrice: 6_000, lines: content }],
      sheets,
      fixedLabor,
      spread,
    );
    // Variable: 8 × 200 + 3 × 700 = 3 700. Fixed share: 100 minutes × 20.1 = 2 010. Cost: 5 710.
    expect(pack).toMatchObject({ sold: 1, price: 6_000, variableCost: 3_700, confidence: 'measured' });
    expect(pack?.cost).toBeCloseTo(5_710, 6);
    expect(pack?.margin).toBeCloseTo(290, 6);
  });

  it('shows a pack sold at a loss as it is, and judges nothing', () => {
    const [pack] = packMargins(
      [{ packName: 'Famille', packPrice: 5_000, lines: content }],
      sheets,
      fixedLabor,
      spread,
    );
    expect(pack?.margin).toBeCloseTo(-710, 6);
  });

  it('counts only what the pack covered: pieces beyond its quota are not its cost', () => {
    const beyond = [line('art_shirt', 10, 8), line('art_suit', 3, 3)];
    const [pack] = packMargins(
      [{ packName: 'Business 12 pièces', packPrice: 6_000, lines: beyond }],
      sheets,
      fixedLabor,
      { perMinute: 0, perUnit: 0, units: 0, minutes: 0 },
    );
    expect(pack?.cost).toBe(3_700);
  });

  it('leaves out a sale with an article never measured, and says « in part »', () => {
    const withDress = [line('art_shirt', 8, 8), line('art_dress', 2, 2)];
    const margins = packMargins(
      [
        { packName: 'Business 12 pièces', packPrice: 6_000, lines: content },
        { packName: 'Business 12 pièces', packPrice: 6_000, lines: withDress },
        { packName: 'Étudiant', packPrice: 3_000, lines: [line('art_dress', 4, 4)] },
      ],
      sheets,
      fixedLabor,
      spread,
    );
    expect(margins[0]).toMatchObject({ sold: 2, costedSales: 1, confidence: 'partial' });
    expect(margins[0]?.margin).toBeCloseTo(290, 6);
    expect(margins[1]).toMatchObject({
      packName: 'Étudiant',
      margin: null,
      cost: null,
      confidence: 'never',
    });
  });

  it('says « estimated » when a sheet was not measured at the laundry', () => {
    const guessed = indexSheets([sheet({ measured: false })]);
    const [pack] = packMargins(
      [{ packName: 'P', packPrice: 1_000, lines: [line('art_shirt', 2, 2)] }],
      guessed,
      fixedLabor,
      spreadFixed(0, [], guessed),
    );
    expect(pack?.confidence).toBe('estimated');
  });
});

describe('the guard-rail, break-even, the result', () => {
  const sheets = indexSheets([shirtSheet]); // 160 variable

  it('flags a deposit under the variable cost of its content, only when all of it is measured', () => {
    expect(belowVariableCost(600, [line('art_shirt', 4)], sheets, fixedLabor)).toEqual({
      below: true,
      variableCost: 640,
    });
    expect(belowVariableCost(640, [line('art_shirt', 4)], sheets, fixedLabor)?.below).toBe(false);
    expect(belowVariableCost(1, [line('art_dress', 1)], sheets, fixedLabor)).toBeNull();
  });

  it('break-even: fixed charges ÷ what a unit leaves', () => {
    const even = breakEven({
      cashed: 500_000,
      fixedCharges: 340_000,
      workingDays: 26,
      lines: [line('art_shirt', 1000)],
      sheets,
      settings: fixedLabor,
    });
    // A unit brings 500, costs 160: it leaves 340. 340 000 ÷ 340 = 1 000 units, 38.46 a day.
    expect(even).toMatchObject({ units: 1000, contribution: 340, unitsPerMonth: 1000, reason: null });
    expect(even.unitsPerDay).toBeCloseTo(38.46, 2);
    expect(even.coverage).toBe(1);
  });

  it('says in words when there is no number to show', () => {
    const base = { fixedCharges: 100_000, workingDays: 26, sheets, settings: fixedLabor };
    expect(breakEven({ ...base, cashed: 0, lines: [] }).reason).toBe('no_activity');
    expect(breakEven({ ...base, cashed: 9_000, lines: [line('art_dress', 10)] })).toMatchObject({
      reason: 'no_sheet',
      unitsPerMonth: null,
    });
    expect(breakEven({ ...base, cashed: 1_000, lines: [line('art_shirt', 10)] })).toMatchObject({
      reason: 'no_contribution',
      unitsPerMonth: null,
      unitsPerDay: null,
    });
  });

  it('the result is on cash received; a draw never changes it', () => {
    expect(
      periodResult({ cashed: 1_103_000, fixedCharges: 512_000, variableCharges: 336_500, draws: 70_000 }),
    ).toMatchObject({ charges: 848_500, result: 254_500, draws: 70_000, left: 184_500 });
    expect(periodResult({ cashed: 0, fixedCharges: 0, variableCharges: 0, draws: 0 })).toMatchObject({
      result: 0,
      rate: 0,
    });
  });

  it('planned against real variable costs', () => {
    expect(
      reconciliation({
        lines: [line('art_shirt', 1000), line('art_dress', 250)],
        sheets,
        settings: fixedLabor,
        variableCharges: 200_000,
      }),
    ).toEqual({ planned: 160_000, real: 200_000, gap: 40_000, coverage: 0.8 });
  });
});

describe('the money of a laundry', () => {
  let db: TestSchema;
  let site: Site;
  let read: Catalog;
  const afi = person('usr_afi', 'owner');
  const essi = person('usr_essi', 'member'); // cashier
  const lawson = person('usr_lawson', 'member'); // accountant
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? '';
  const wash = (name: string, quantity: number) => ({
    serviceId: service('Lavage et repassage'),
    articleId: article(name),
    quantity,
  });
  const sessions = (who = afi) => done<CashSession[]>(who, 'cash_sessions', {});
  type Received = { orderId: string; total: number; belowCost: boolean };

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'established',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    site = (await done<{ sites: Site[] }>(afi, 'business_overview', {})).sites[0] as Site;
    read = await done<Catalog>(afi, 'catalog_read', {});
    for (const [name, amount] of [['Chemise', 500], ['Costume', 2500], ['Robe', 1500]] as const) {
      await done(afi, 'catalog_set_price', { ...wash(name, 1), quantity: undefined, amount });
    }
    await done(afi, 'catalog_save_pack', { name: 'Business 12 pièces', mode: 'pieces', quota: 12, price: 6000 });
    read = await done<Catalog>(afi, 'catalog_read', {});
    await hire(essi, 'cashier');
    await hire(lawson, 'accountant');
  });

  afterAll(async () => {
    await db.drop();
  });

  describe('the till falls right (specs/003, US1)', () => {
    let deposit: Received;

    it('in a team, cash does not move without an open till; Mobile Money needs none', async () => {
      deposit = await done<Received>(afi, 'orders_receive', {
        siteId: site.siteId,
        phone: '90 12 34 56',
        customerName: 'Mme Adjovi',
        lines: [wash('Chemise', 20)],
      });
      const cash = { orderId: deposit.orderId, amount: 1000, method: 'cash' };
      expect(await act(essi, 'payments_record', cash)).toEqual({
        ok: false,
        code: 'cash_session_needed',
      });
      expect((await act(essi, 'payments_record', { ...cash, method: 'mobile_money' })).ok).toBe(true);
    });

    it('opens one till per cashier and site, with its float', async () => {
      await done(essi, 'cash_open', { siteId: site.siteId, openingFloat: 10_000 });
      expect(await act(essi, 'cash_open', { siteId: site.siteId, openingFloat: 0 })).toEqual({
        ok: false,
        code: 'cash_session_open',
      });
      expect(await sessions(essi)).toMatchObject([{ openingFloat: 10_000, expected: 10_000, closedAt: null }]);
    });

    it('follows every franc: cash in, a refund, an expense, a bank deposit', async () => {
      const [till] = await sessions(essi);
      await done(essi, 'payments_record', { orderId: deposit.orderId, amount: 8_000, method: 'cash' });
      // The owner refunds from her own till: she has none open, and she works in a team.
      const refund = { orderId: deposit.orderId, amount: 1_000, method: 'cash', reason: 'erreur' };
      expect(await act(afi, 'payments_refund', refund)).toEqual({
        ok: false,
        code: 'cash_session_needed',
      });
      await done(afi, 'cash_open', { siteId: site.siteId, openingFloat: 5_000 });
      await done(afi, 'payments_refund', refund);
      await done(essi, 'expenses_record', {
        spentOn: today,
        label: 'Cintres',
        category: 'packaging',
        behavior: 'variable',
        amount: 2_500,
        paidFrom: 'till',
        siteId: site.siteId,
      });
      await done(essi, 'cash_deposit_at_bank', { sessionId: till?.sessionId, amount: 5_000 });
      const [mine] = await sessions(essi);
      expect(mine).toMatchObject({ cashIn: 8_000, expenses: 2_500, bankDeposits: 5_000, expected: 10_500 });
      // Cash cannot leave a till that does not hold it.
      expect(
        await act(essi, 'cash_deposit_at_bank', { sessionId: till?.sessionId, amount: 10_501 }),
      ).toEqual({ ok: false, code: 'cash_not_in_till' });
    });

    it('a cashier sees her own till; whoever reads the money sees all', async () => {
      expect(await sessions(essi)).toHaveLength(1);
      const all = await sessions(afi);
      expect(all).toHaveLength(2);
      expect(all.find((s) => s.cashierId === 'usr_afi')).toMatchObject({ cashRefunds: 1_000, expected: 4_000 });
    });

    it('closes with what was counted; the gap is kept, never corrected', async () => {
      const [till] = await sessions(essi);
      const closed = await done(essi, 'cash_close', { sessionId: till?.sessionId, counted: 10_000 });
      expect(closed).toMatchObject({ expected: 10_500, counted: 10_000, gap: -500 });
      expect(await act(essi, 'cash_close', { sessionId: till?.sessionId, counted: 10_500 })).toEqual({
        ok: false,
        code: 'cash_session_closed',
      });
      const kept = (await sessions(afi)).find((s) => s.sessionId === till?.sessionId);
      expect(kept).toMatchObject({ gap: -500, expected: 10_500, counted: 10_000 });
      expect(kept?.closedAt).not.toBeNull();
      // Closed: cash is refused again until a till opens.
      expect(
        await act(essi, 'payments_record', { orderId: deposit.orderId, amount: 100, method: 'cash' }),
      ).toEqual({ ok: false, code: 'cash_session_needed' });
    });

    it('an agent never opens a till: it prepares, a person confirms', async () => {
      const prepared = await asPerson(essi, () =>
        registry.invoke({
          ...agentFor(essi),
          name: 'cash_open',
          input: { siteId: site.siteId, openingFloat: 1 },
        }),
      );
      expect(prepared).toMatchObject({ status: 'draft' });
      expect((await sessions(essi)).filter((s) => !s.closedAt)).toHaveLength(0);
    });
  });

  describe('everything that goes out, and what the owner takes (specs/003, US2-3)', () => {
    const list = (who = afi) => done<ExpensesView>(who, 'expenses_list', { month });

    it('records a recurring charge, and refuses to pay one from the till', async () => {
      const rent = {
        spentOn: `${month}-01`,
        label: 'Loyer',
        category: 'rent',
        behavior: 'fixed',
        amount: 12_000,
        paidFrom: 'bank',
        recurring: true,
      };
      await done(afi, 'expenses_record', rent);
      expect(await act(afi, 'expenses_record', { ...rent, paidFrom: 'till' })).toEqual({
        ok: false,
        code: 'recurring_not_from_till',
      });
      const view = await list();
      expect(view.totals).toEqual({ fixed: 12_000, variable: 2_500, total: 14_500 });
      expect(view.expenses.find((e) => e.label === 'Loyer')).toMatchObject({ recurring: true, times: 1 });
    });

    it('voids an expense with a reason: it stays, marked, and counts nowhere', async () => {
      const { expenseId } = await done<{ expenseId: string }>(afi, 'expenses_record', {
        spentOn: today,
        label: 'Erreur',
        category: 'other',
        behavior: 'variable',
        amount: 99_999,
        paidFrom: 'other',
      });
      expect((await list()).totals.variable).toBe(102_499);
      await done(afi, 'expenses_void', { expenseId, reason: 'saisie en double' });
      const view = await list();
      expect(view.totals.variable).toBe(2_500);
      expect(view.expenses.find((e) => e.expenseId === expenseId)).toMatchObject({
        voided: true,
        voidReason: 'saisie en double',
        times: 0,
      });
      expect(await act(afi, 'expenses_void', { expenseId, reason: 'encore' })).toEqual({
        ok: false,
        code: 'expense_voided',
      });
    });

    it('a draw is the owner’s gesture, shown apart, hidden from who may not read the money', async () => {
      const draw = { drawnOn: today, amount: 3_000, paidFrom: 'mobile_money' };
      expect(await act(essi, 'draws_record', draw)).toEqual({ ok: false, code: 'not_allowed' });
      await done(afi, 'draws_record', draw);
      expect((await list()).draws).toMatchObject([{ amount: 3_000 }]);
      expect((await list(essi)).draws).toBeNull();
      expect((await list(lawson)).draws).toHaveLength(1);
      // The accountant reads, and writes nothing.
      expect(await act(lawson, 'expenses_record', { ...draw, spentOn: today, label: 'x', category: 'other', behavior: 'variable' })).toEqual({
        ok: false,
        code: 'not_allowed',
      });
    });
  });

  describe('knowing whether I earn (specs/004)', () => {
    const result = (who = afi) => done<ResultView>(who, 'money_result', { month });

    it('before any sheet: the result is there, and the rest says « never measured »', async () => {
      const figures = await result();
      // Cashed: 1 000 (Mobile Money) + 8 000 − 1 000 refunded.
      expect(figures.result).toMatchObject({
        cashed: 8_000,
        charges: 14_500,
        result: -6_500,
        draws: 3_000,
        left: -9_500,
      });
      expect(figures.breakEven).toMatchObject({ reason: 'no_sheet', unitsPerMonth: null });
      expect(figures.reconciliation).toMatchObject({ planned: 0, real: 2_500, coverage: 0 });
      expect(figures.packs).toEqual([]);
    });

    it('writes cost sheets — the owner’s gesture — and reads each cost', async () => {
      const shirt = {
        ...wash('Chemise', 1),
        quantity: undefined,
        laborMinutes: 6,
        consumablesCost: 120,
        machineCost: 40,
        measured: true,
      };
      expect(await act(lawson, 'costs_save_sheet', shirt)).toEqual({ ok: false, code: 'not_allowed' });
      await done(afi, 'costs_save_sheet', shirt);
      await done(afi, 'costs_save_sheet', {
        ...shirt,
        articleId: article('Costume'),
        laborMinutes: 24,
        consumablesCost: 300,
        machineCost: 100,
        measured: false,
      });
      const costs = await done<CostsView>(lawson, 'costs_read', { month });
      const row = (name: string) => costs.rows.find((r) => r.articleName === name);
      expect(row('Chemise')).toMatchObject({ price: 500, variableCost: 160 });
      expect(row('Costume')?.sheet).toMatchObject({ measured: false });
      expect(row('Robe')).toMatchObject({ sheet: null, variableCost: null, completeCost: null });
      // The month: 20 shirts, 120 minutes; 12 000 of fixed charges → 100 a minute.
      expect(costs.spread).toMatchObject({ minutes: 120, perMinute: 100 });
      expect(row('Chemise')?.completeCost).toBe(160 + 600);
      // A cashier does not read costs.
      expect(await act(essi, 'costs_read', {})).toEqual({ ok: false, code: 'not_allowed' });
    });

    it('a pack’s margin rests on its real content; a sale never measured is said', async () => {
      const pack = read.packs[0];
      await done<Received>(afi, 'orders_receive', {
        siteId: site.siteId,
        phone: '90 12 34 56',
        lines: [wash('Chemise', 8), wash('Costume', 3)],
        packId: pack?.packId,
      });
      await done<Received>(afi, 'orders_receive', {
        siteId: site.siteId,
        phone: '90 12 34 56',
        lines: [wash('Chemise', 4), wash('Robe', 2)],
        packId: pack?.packId,
      });
      const figures = await result();
      // The month now: 32 shirts (192 min) and 3 suits (72 min) with sheets: 264 minutes;
      // 12 000 ÷ 264 a minute. The first sale: 8 shirts + 3 suits = 120 minutes.
      const perMinute = 12_000 / 264;
      const expected = 8 * 160 + 3 * 400 + 120 * perMinute;
      expect(figures.packs).toHaveLength(1);
      expect(figures.packs[0]).toMatchObject({
        packName: 'Business 12 pièces',
        sold: 2,
        costedSales: 1,
        price: 6_000,
        variableCost: 2_480,
        confidence: 'partial',
      });
      expect(figures.packs[0]?.cost).toBeCloseTo(expected, 6);
      expect(figures.packs[0]?.margin).toBeCloseTo(6_000 - expected, 6);
      expect(figures.units).toBe(37);
      expect(figures.reconciliation.coverage).toBeCloseTo(35 / 37, 6);
    });

    it('the guard-rail flags a deposit under its variable cost, in its history, without blocking', async () => {
      // 10 shirts cost 1 600 in variable; a 3 500 discount leaves 1 500.
      const cheap = await done<Received>(afi, 'orders_receive', {
        siteId: site.siteId,
        phone: '90 12 34 56',
        lines: [wash('Chemise', 10)],
        discount: 3_500,
        discountReason: 'stratégie de lancement',
      });
      expect(cheap).toMatchObject({ total: 1_500, belowCost: true });
      const full = await done<Order>(afi, 'orders_get', { orderId: cheap.orderId });
      expect(full.events[0]).toMatchObject({ kind: 'received', detail: { belowCost: true } });
      expect((await result()).belowCost).toBe(1);
      // While typing: the owner is told the cost; the cashier only that it is under it.
      const check = { total: 1_500, lines: [wash('Chemise', 10)] };
      expect(await done(afi, 'orders_check_cost', check)).toEqual({ below: true, variableCost: 1_600 });
      await done(afi, 'team_set_role_permissions', {
        role: 'cashier',
        permissions: ['business:read', 'orders:read', 'orders:create', 'cash:operate', 'expenses:read', 'expenses:write', 'payments:collect', 'customers:read', 'customers:write'],
      });
      expect(await done(essi, 'orders_check_cost', check)).toEqual({ below: true, variableCost: null });
      // A piece with no sheet: nothing is said rather than guessed.
      expect(await done(afi, 'orders_check_cost', { total: 1, lines: [wash('Robe', 1)] })).toBeNull();
    });

    it('says in words when break-even cannot be reached', async () => {
      const figures = await result();
      // 47 units for 8 000 cashed: 170 a unit, under the 176 average variable cost.
      expect(figures.breakEven.units).toBe(47);
      expect(figures.breakEven).toMatchObject({ reason: 'no_contribution', unitsPerMonth: null });
    });

    it('a month with nothing shows zeros and invents nothing', async () => {
      const empty = await done<ResultView>(afi, 'money_result', { month: '2025-01' });
      expect(empty.result).toMatchObject({ cashed: 0, charges: 0, result: 0, left: 0 });
      expect(empty).toMatchObject({ orders: 0, units: 0, packs: [] });
      expect(empty.breakEven.reason).toBe('no_activity');
    });

    it('a copilot reads the result for the owner, never for who may not', async () => {
      const read = await asPerson(afi, () =>
        registry.invoke({ ...agentFor(afi), name: 'money_result', input: { month } }),
      );
      expect(read).toMatchObject({ status: 'done', output: { month } });
      expect(
        await asPerson(essi, () =>
          registry.invoke({ ...agentFor(essi), name: 'money_result', input: {} }),
        ),
      ).toEqual({ status: 'refused', reason: 'not_allowed' });
    });
  });

  it('keeps each organization’s tills, expenses, draws and costs to itself (RLS)', async () => {
    const chain: Record<string, (org: string) => string[]> = {
      cash_sessions: (org) => [
        `insert into sites (site_id, organization_id, name, code, kind)
         values ('sit_cs_${org}', '${org}', 'x', 'XA', 'counter_plant')`,
        `insert into cash_sessions (session_id, organization_id, site_id, cashier_id, opening_float)
         values ('csh_${org}', '${org}', 'sit_cs_${org}', 'usr_x', 0)`,
      ],
      cash_movements: (org) => [
        `insert into sites (site_id, organization_id, name, code, kind)
         values ('sit_cm_${org}', '${org}', 'x', 'XB', 'counter_plant')`,
        `insert into cash_sessions (session_id, organization_id, site_id, cashier_id, opening_float)
         values ('csh_cm_${org}', '${org}', 'sit_cm_${org}', 'usr_y', 0)`,
        `insert into cash_movements (movement_id, organization_id, session_id, kind, amount, created_by)
         values ('mov_${org}', '${org}', 'csh_cm_${org}', 'bank_deposit', 1, 'usr_y')`,
      ],
      expenses: (org) => [
        `insert into expenses (expense_id, organization_id, spent_on, label, category, behavior, amount,
                               paid_from, created_by)
         values ('exp_${org}', '${org}', current_date, 'x', 'other', 'variable', 1, 'other', 'usr_x')`,
      ],
      owner_draws: (org) => [
        `insert into owner_draws (draw_id, organization_id, drawn_on, amount, paid_from, created_by)
         values ('drw_${org}', '${org}', current_date, 1, 'other', 'usr_x')`,
      ],
      cost_sheets: (org) => [
        `insert into services (service_id, organization_id, name, nature, pricing)
         values ('svc_cst_${org}', '${org}', 'x', 'workshop', 'per_kg')`,
        `insert into cost_sheets (sheet_id, organization_id, service_id, updated_by)
         values ('cst_${org}', '${org}', 'svc_cst_${org}', 'usr_x')`,
      ],
    };
    for (const table of Object.keys(chain)) {
      await assertOrganizationIsolation({
        app: db.app,
        table,
        organizations: ['org_x', 'org_y'],
        insert: async (client, organizationId) => {
          for (const sql of chain[table]?.(organizationId) ?? []) await client.query(sql);
        },
      });
    }
  }, 180_000);
});
