import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { StockBoard, StockConsumption } from '../src/features/stock';
import {
  averageCost,
  checkReception,
  checkSupplierPayment,
  checkUse,
  consumption,
  countGap,
  debtOf,
  levelOf,
  purchaseNumber,
  purchaseTotal,
  stateOf,
} from '../src/features/stock/domain/stock';
import { transaction } from '../src/platform/db';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// Stock and purchasing (specs/029-stock): shelves and their movements, purchase orders and their
// reception, what is owed to suppliers, inventories, consumption against the cost sheets.

const code = (work: () => void): string | null => {
  try {
    work();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'thrown';
  }
};

describe('stock, pure rules', () => {
  it('a level is every movement added up; an average cost is what was really paid', () => {
    expect(levelOf([{ quantity: 40 }, { quantity: -30.5 }, { quantity: -0.25 }, { quantity: 1 }])).toBe(10.25);
    expect(levelOf([])).toBe(0);
    expect(
      averageCost([
        { quantity: 40, unitCost: 1_500 },
        { quantity: 10, unitCost: 2_000 },
      ]),
    ).toBe(1_600);
    // Nothing received with a cost: no value is guessed.
    expect(averageCost([{ quantity: 5, unitCost: null }])).toBeNull();
    expect(averageCost([])).toBeNull();
  });

  it('out when nothing is left; low at or under the laundry’s threshold; no threshold, no alert', () => {
    expect(stateOf(0, 10)).toBe('out');
    expect(stateOf(-1, 0)).toBe('out');
    expect(stateOf(10, 10)).toBe('low');
    expect(stateOf(10.001, 10)).toBe('ok');
    expect(stateOf(3, 0)).toBe('ok');
  });

  it('what leaves a shelf is on it; an inventory keeps its gap', () => {
    expect(code(() => checkUse(5, 8))).toBeNull();
    expect(code(() => checkUse(8.001, 8))).toBe('stock_insufficient');
    expect(code(() => checkUse(0, 8))).toBe('quantity_invalid');
    expect(countGap(6.5, 7)).toBe(-0.5);
    expect(countGap(7, 7)).toBe(0);
    expect(countGap(7.125, 7)).toBe(0.125);
  });

  it('an order has its number and its worth; a reception says what really came', () => {
    expect(purchaseNumber(7)).toBe('BC-0007');
    expect(
      purchaseTotal([
        { quantity: 40, unitCost: 1_500 },
        { quantity: 2.5, unitCost: 333 },
      ]),
    ).toBe(60_833);
    const ordered = ['l1', 'l2'];
    expect(code(() => checkReception('ordered', ordered, [{ lineId: 'l1', quantity: 38, unitCost: 1_600 }]))).toBeNull();
    expect(code(() => checkReception('received', ordered, [{ lineId: 'l1', quantity: 1, unitCost: 1 }]))).toBe('purchase_not_open');
    expect(code(() => checkReception('ordered', ordered, [{ lineId: 'l9', quantity: 1, unitCost: 1 }]))).toBe('not_found');
    expect(code(() => checkReception('ordered', ordered, [{ lineId: 'l1', quantity: 0, unitCost: 1 }]))).toBe('reception_empty');
    expect(
      code(() =>
        checkReception('ordered', ordered, [
          { lineId: 'l1', quantity: 1, unitCost: 1 },
          { lineId: 'l1', quantity: 1, unitCost: 1 },
        ]),
      ),
    ).toBe('invalid_input');
  });

  it('a supplier is paid what is owed, never more', () => {
    expect(debtOf(70_800, 50_000)).toBe(20_800);
    expect(code(() => checkSupplierPayment(20_800, 20_800))).toBeNull();
    expect(code(() => checkSupplierPayment(20_801, 20_800))).toBe('payment_above_debt');
    expect(code(() => checkSupplierPayment(0, 20_800))).toBe('amount_invalid');
  });

  it('what the sheets planned against what left the shelves', () => {
    const planned = new Map([
      ['srv_wash|art_shirt', 100],
      ['srv_kilo|', 62.5],
    ]);
    const lines = [
      { serviceId: 'srv_wash', articleId: 'art_shirt', quantity: 4 },
      { serviceId: 'srv_kilo', articleId: null, quantity: 3.5 },
      { serviceId: 'srv_dry', articleId: 'art_suit', quantity: 2.5 },
    ];
    // 400 + 218.75 planned; the suit has no sheet: said in the coverage, never estimated.
    expect(consumption({ lines, planned, used: 1_000 })).toEqual({ planned: 619, used: 1_000, gap: 381, coverage: 0.75 });
    expect(consumption({ lines: [], planned, used: 0 })).toEqual({ planned: 0, used: 0, gap: 0, coverage: 0 });
  });
});

describe('shelves, orders and suppliers', () => {
  let db: TestSchema;
  let site: Site;
  let read: Catalog;
  let lessive = '';
  let cintres = '';
  let supplierId = '';
  let purchaseId = '';
  const afi = person('usr_afi', 'owner');
  const kossi = person('usr_kossi', 'member'); // manager
  const yao = person('usr_yao', 'member'); // workshop
  const mawuli = person('usr_mawuli', 'member'); // counter
  const board = (who = afi) => done<StockBoard>(who, 'stock_board', {});
  const item = async (itemId: string) => (await board()).items.find((each) => each.itemId === itemId);
  const sql = (text: string, values: unknown[] = []) => transaction('org_acme', (client) => client.query(text, values));
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? null;

  beforeAll(async () => {
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
    await hire(afi, 'owner');
    await hire(kossi, 'manager');
    await hire(yao, 'workshop');
    await hire(mawuli, 'counter');
  }, 300_000);

  afterAll(async () => {
    await db.drop();
  });

  it('the consumables are the laundry’s own list, with its own thresholds', async () => {
    expect(await act(mawuli, 'stock_board', {})).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(yao, 'stock_set_item', { name: 'Lessive', unit: 'L', threshold: 10 })).toEqual({ ok: false, code: 'not_allowed' });
    lessive = (await done<{ itemId: string }>(afi, 'stock_set_item', { name: 'Lessive', unit: 'L', threshold: 10 })).itemId;
    cintres = (await done<{ itemId: string }>(kossi, 'stock_set_item', { name: 'Cintres', unit: 'pièce', threshold: 50 })).itemId;
    expect(await act(afi, 'stock_set_item', { name: 'lessive', unit: 'kg' })).toEqual({ ok: false, code: 'stock_name_taken' });
    expect(await act(afi, 'stock_set_item', { itemId: 'stk_unknown', name: 'Housses', unit: 'pièce' })).toEqual({
      ok: false,
      code: 'not_found',
    });
    const view = await board(yao);
    expect(view.items.map((each) => [each.name, each.unit, each.level, each.state, each.averageCost, each.value])).toEqual([
      ['Cintres', 'pièce', 0, 'out', null, null],
      ['Lessive', 'L', 0, 'out', null, null],
    ]);
    expect(view.may).toEqual({ manage: false, move: true, order: false, pay: false });
    const { items } = await done<{ items: { name: string; state: string }[] }>(yao, 'stock_alerts', {});
    expect(items.map((each) => [each.name, each.state])).toEqual([
      ['Cintres', 'out'],
      ['Lessive', 'out'],
    ]);
  }, 120_000);

  it('an order is written to a supplier; nothing is in stock until it arrives', async () => {
    supplierId = (await done<{ supplierId: string }>(afi, 'suppliers_set', { name: 'Togo Détergents', phone: '90 00 00 07' })).supplierId;
    expect(await act(afi, 'suppliers_set', { name: 'togo détergents' })).toEqual({ ok: false, code: 'supplier_name_taken' });
    const order = {
      supplierId,
      lines: [
        { itemId: lessive, quantity: 40, unitCost: 1_500 },
        { itemId: cintres, quantity: 200, unitCost: 50 },
      ],
    };
    expect(await act(yao, 'purchases_order', order)).toEqual({ ok: false, code: 'not_allowed' });
    const prepared = await asPerson(afi, () => registry.invoke({ ...agentFor(afi), name: 'purchases_order', input: order }));
    expect(prepared).toMatchObject({ status: 'draft' });
    const written = await done<{ purchaseId: string; number: string; total: number }>(afi, 'purchases_order', order);
    expect(written).toMatchObject({ number: 'BC-0001', total: 70_000 });
    purchaseId = written.purchaseId;
    expect(await act(afi, 'purchases_order', { supplierId, lines: [order.lines[0], order.lines[0]] })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    expect(await act(afi, 'purchases_order', { supplierId, lines: [{ itemId: 'stk_unknown', quantity: 1, unitCost: 1 }] })).toEqual({
      ok: false,
      code: 'not_found',
    });
    expect(await act(afi, 'purchases_order', { ...order, supplierId: 'sup_unknown' })).toEqual({ ok: false, code: 'not_found' });
    expect((await item(lessive))?.level).toBe(0);
    expect((await board()).owed).toBe(0);
  }, 120_000);

  it('the reception says what really came, at what it really cost — and the laundry owes it', async () => {
    const open = (await board()).purchases.find((purchase) => purchase.purchaseId === purchaseId);
    const line = (name: string) => open?.lines.find((each) => each.itemName === name)?.lineId ?? '';
    const reception = {
      purchaseId,
      lines: [
        { lineId: line('Lessive'), quantity: 38, unitCost: 1_600 },
        { lineId: line('Cintres'), quantity: 200, unitCost: 50 },
      ],
    };
    expect(await act(mawuli, 'purchases_receive', reception)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await done(yao, 'purchases_receive', reception)).toEqual({
      number: 'BC-0001',
      supplier: 'Togo Détergents',
      owed: 70_800,
    });
    expect(await act(yao, 'purchases_receive', reception)).toEqual({ ok: false, code: 'purchase_not_open' });
    expect(await item(lessive)).toMatchObject({ level: 38, state: 'ok', averageCost: 1_600, value: 60_800 });
    expect(await item(cintres)).toMatchObject({ level: 200, averageCost: 50, value: 10_000 });
    const view = await board();
    expect(view.owed).toBe(70_800);
    expect(view.suppliers[0]).toMatchObject({ name: 'Togo Détergents', owed: 70_800 });
    expect(view.purchases[0]).toMatchObject({ number: 'BC-0001', status: 'received' });
    // An order that never came is cancelled, not received at zero.
    const second = await done<{ purchaseId: string; number: string }>(afi, 'purchases_order', {
      supplierId,
      lines: [{ itemId: lessive, quantity: 20, unitCost: 1_600 }],
    });
    expect(second.number).toBe('BC-0002');
    const waiting = (await board()).purchases.find((purchase) => purchase.purchaseId === second.purchaseId);
    expect(
      await act(yao, 'purchases_receive', {
        purchaseId: second.purchaseId,
        lines: [{ lineId: waiting?.lines[0]?.lineId, quantity: 0, unitCost: 1_600 }],
      }),
    ).toEqual({ ok: false, code: 'reception_empty' });
    await done(afi, 'purchases_cancel', { purchaseId: second.purchaseId });
    expect(await act(afi, 'purchases_cancel', { purchaseId: second.purchaseId })).toEqual({ ok: false, code: 'purchase_not_open' });
    expect((await board()).owed).toBe(70_800);
  }, 180_000);

  it('what leaves a shelf is recorded; under its threshold the laundry is told', async () => {
    expect(await act(mawuli, 'stock_use', { itemId: lessive, quantity: 1 })).toEqual({ ok: false, code: 'not_allowed' });
    expect(await done(yao, 'stock_use', { itemId: lessive, quantity: 30, note: 'Semaine 41' })).toEqual({
      name: 'Lessive',
      unit: 'L',
      left: 8,
    });
    expect(await act(yao, 'stock_use', { itemId: lessive, quantity: 9 })).toEqual({ ok: false, code: 'stock_insufficient' });
    await done(yao, 'stock_use', { itemId: lessive, quantity: 1, loss: true, note: 'Bidon renversé' });
    expect(await item(lessive)).toMatchObject({ level: 7, state: 'low' });
    const { items } = await done<{ items: { name: string; state: string; level: number }[] }>(afi, 'stock_alerts', {});
    expect(items).toEqual([expect.objectContaining({ name: 'Lessive', state: 'low', level: 7 })]);
    // An agent prepares a withdrawal; nothing leaves.
    const prepared = await asPerson(yao, () =>
      registry.invoke({ ...agentFor(yao), name: 'stock_use', input: { itemId: lessive, quantity: 1 } }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect((await item(lessive))?.level).toBe(7);
    expect((await board()).moves.map((move) => [move.itemName, move.kind, move.quantity]).slice(0, 2)).toEqual([
      ['Lessive', 'loss', -1],
      ['Lessive', 'use', -30],
    ]);
  }, 120_000);

  it('an inventory makes the count the level, and keeps the gap', async () => {
    const counts = {
      counts: [
        { itemId: lessive, counted: 6.5 },
        { itemId: cintres, counted: 200 },
      ],
    };
    expect(await act(yao, 'stock_count', counts)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await done(kossi, 'stock_count', counts)).toEqual({
      counted: 2,
      gaps: [{ name: 'Lessive', unit: 'L', gap: -0.5 }],
    });
    expect((await item(lessive))?.level).toBe(6.5);
    expect((await board()).moves[0]).toMatchObject({ itemName: 'Lessive', kind: 'count', quantity: -0.5 });
    // Counted again at the same level: nothing to say.
    expect(await done(kossi, 'stock_count', counts)).toEqual({ counted: 2, gaps: [] });
  }, 120_000);

  it('a supplier is paid what is owed — and the payment is an expense of the month', async () => {
    const payment = { supplierId, amount: 50_000, paidFrom: 'mobile_money' };
    expect(await act(yao, 'suppliers_pay', payment)).toEqual({ ok: false, code: 'not_allowed' });
    const prepared = await asPerson(kossi, () => registry.invoke({ ...agentFor(kossi), name: 'suppliers_pay', input: payment }));
    expect(prepared).toMatchObject({ status: 'draft' });
    expect(await done(kossi, 'suppliers_pay', payment)).toEqual({ name: 'Togo Détergents', paid: 50_000, owed: 20_800 });
    expect(await act(kossi, 'suppliers_pay', { ...payment, amount: 20_801 })).toEqual({ ok: false, code: 'payment_above_debt' });
    expect((await board()).owed).toBe(20_800);
    const { expenses, totals } = await done<{
      expenses: { label: string; amount: number; category: string }[];
      totals: { variable: number };
    }>(afi, 'expenses_list', {});
    expect(expenses).toEqual([expect.objectContaining({ label: 'Togo Détergents', amount: 50_000, category: 'detergent' })]);
    expect(totals.variable).toBe(50_000);
    // Paid from a till, it goes through the till's rules: no open till, no payment.
    expect(await act(kossi, 'suppliers_pay', { supplierId, amount: 800, paidFrom: 'till', siteId: site.siteId })).toMatchObject({
      ok: false,
    });
    expect((await board()).owed).toBe(20_800);
  }, 120_000);

  it('what the cost sheets planned in consumables, against what left the shelves', async () => {
    const serviceId = service('Lavage et repassage');
    const articleId = article('Chemise');
    await done(afi, 'catalog_set_price', { serviceId, articleId, amount: 500 });
    await done(afi, 'costs_save_sheet', { serviceId, articleId, laborMinutes: 6, consumablesCost: 100, machineCost: 30, measured: true });
    await done(afi, 'orders_receive', {
      siteId: site.siteId,
      phone: '90 12 34 56',
      customerName: 'Mme Adjovi',
      lines: [{ serviceId, articleId, quantity: 4 }],
    });
    const view = await done<StockConsumption>(afi, 'stock_consumption', {});
    // Four shirts at 100 of consumables planned; 31 L left the shelves at 1 600 on average.
    expect(view).toMatchObject({ planned: 400, used: 49_600, gap: 49_200, coverage: 1, unpriced: [] });
    expect(await act(yao, 'stock_consumption', {})).toEqual({ ok: false, code: 'not_allowed' });
  }, 120_000);

  it('one laundry’s shelves, orders and suppliers are never another’s', async () => {
    const expense = await sql(`select expense_id from supplier_payments limit 1`);
    const expenseId = String(expense.rows[0]?.expense_id);
    const rows: [string, (organizationId: string) => string][] = [
      ['stock_items', (o) => `(item_id, organization_id, name, unit) values ('stk_${o}', '${o}', 'Item ${o}', 'L')`],
      ['suppliers', (o) => `(supplier_id, organization_id, name) values ('sup_${o}', '${o}', 'Supplier ${o}')`],
      ['purchase_counters', (o) => `(organization_id, next_seq) values ('${o}', 2)`],
      [
        'purchase_orders',
        (o) => `(purchase_id, organization_id, number, supplier_id, created_by) values ('pur_${o}', '${o}', 'BC-1', '${supplierId}', 'usr_x')`,
      ],
      [
        'purchase_lines',
        (o) =>
          `(line_id, organization_id, purchase_id, item_id, quantity, unit_cost) values ('pli_${o}', '${o}', '${purchaseId}', '${lessive}', 1, 1)`,
      ],
      [
        'stock_moves',
        (o) => `(move_id, organization_id, item_id, kind, quantity, created_by) values ('mov_${o}', '${o}', '${lessive}', 'use', -1, 'usr_x')`,
      ],
      [
        'supplier_payments',
        (o) =>
          `(payment_id, organization_id, supplier_id, amount, expense_id, created_by) values ('spy_${o}', '${o}', '${supplierId}', 1, '${expenseId}', 'usr_x')`,
      ],
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
