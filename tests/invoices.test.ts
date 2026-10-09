import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import {
  allocate,
  dueOn,
  linesOf,
  numberOf,
  statusOf,
  vatInside,
  type InvoicedOrder,
} from '../src/features/invoices/domain/invoice';
import type { CustomerAccount, Invoice, InvoiceSummary } from '../src/features/invoices';
import type { Order } from '../src/features/orders';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// Invoices and credit notes (specs/019-invoices): numbered without a gap, written once, cancelled
// by a credit note and never deleted; what is cashed on one goes to its deposits under their rules.

const order = (over: Partial<InvoicedOrder>): InvoicedOrder => ({
  orderId: 'ord_1',
  number: 'A-0001',
  total: 0,
  packName: null,
  packPrice: 0,
  expressAmount: 0,
  storageAmount: 0,
  discount: 0,
  items: [],
  ...over,
});
const shirts = { serviceName: 'Lavage et repassage', articleName: 'Chemise', pricing: 'per_piece' as const, quantity: 4, amount: 2_000, due: 2_000 };
const kilos = { serviceName: 'Linge au kilo', articleName: null, pricing: 'per_kg' as const, quantity: 3.5, amount: 2_100, due: 2_100 };

describe('an invoice, pure rules', () => {
  it('numbers each series by year, four digits at least', () => {
    expect(numberOf('invoice', 2026, 42)).toBe('F-2026-0042');
    expect(numberOf('credit', 2026, 3)).toBe('A-2026-0003');
    expect(numberOf('invoice', 2027, 12_345)).toBe('F-2027-12345');
  });

  it('finds the tax inside a total: prices are what the customer pays', () => {
    expect(vatInside(11_800, 18)).toEqual({ net: 10_000, vat: 1_800 });
    expect(vatInside(2_000, 18)).toEqual({ net: 1_695, vat: 305 });
    expect(vatInside(2_000, 0)).toEqual({ net: 2_000, vat: 0 });
  });

  it('falls due after the laundry’s delay, across a month', () => {
    expect(dueOn('2026-10-09', 15)).toBe('2026-10-24');
    expect(dueOn('2026-10-25', 15)).toBe('2026-11-09');
    expect(dueOn('2026-10-09', 0)).toBe('2026-10-09');
  });

  it('is due, paid, or cancelled by a credit note', () => {
    expect(statusOf({ total: 2_000, paid: 500, credited: false })).toBe('due');
    expect(statusOf({ total: 2_000, paid: 2_000, credited: false })).toBe('paid');
    expect(statusOf({ total: 2_000, paid: 2_000, credited: true })).toBe('credited');
  });

  it('one deposit: its content line by line, express and discount — adding up to its total', () => {
    const lines = linesOf([
      order({ total: 4_310, expressAmount: 410, discount: 200, items: [shirts, kilos] }),
    ]);
    expect(lines.map((line) => [line.kind, line.label, line.amount])).toEqual([
      ['item', 'Chemise · Lavage et repassage', 2_000],
      ['item', 'Linge au kilo', 2_100],
      ['express', '', 410],
      ['discount', '', -200],
    ]);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(4_310);
  });

  it('under a pack: the pack’s price, and each piece with what is due beyond it', () => {
    const lines = linesOf([
      order({
        total: 6_500,
        packName: 'Business 12 pièces',
        packPrice: 6_000,
        items: [
          { ...shirts, due: 0 },
          { ...kilos, due: 500 },
        ],
      }),
    ]);
    expect(lines.map((line) => [line.kind, line.amount, line.covered])).toEqual([
      ['pack', 6_000, false],
      ['item', 0, true],
      ['item', 500, false],
    ]);
    expect(lines.reduce((sum, line) => sum + line.amount, 0)).toBe(6_500);
  });

  it('several deposits: one line each, with what it holds', () => {
    const lines = linesOf([
      order({ total: 2_000, items: [shirts] }),
      order({ orderId: 'ord_2', number: 'A-0002', total: 2_100, items: [kilos] }),
    ]);
    expect(lines).toMatchObject([
      { kind: 'order', orderNumber: 'A-0001', label: '4 Chemise · Lavage et repassage', amount: 2_000 },
      { kind: 'order', orderNumber: 'A-0002', label: '3,5 kg Linge au kilo', amount: 2_100 },
    ]);
  });

  it('shares money among the deposits that owe, in their order — never more than is due', () => {
    const owing = [
      { orderId: 'a', balance: 2_100 },
      { orderId: 'b', balance: 0 },
      { orderId: 'c', balance: 900 },
    ];
    expect(allocate(2_500, owing)).toEqual([
      { orderId: 'a', amount: 2_100 },
      { orderId: 'c', amount: 400 },
    ]);
    expect(allocate(3_000, owing)).toHaveLength(2);
    expect(() => allocate(3_001, owing)).toThrow(/payment_above_balance/);
    expect(() => allocate(0, owing)).toThrow(/amount_invalid/);
  });
});

describe('invoices and credit notes', () => {
  let db: TestSchema;
  let site: Site;
  let read: Catalog;
  const afi = person('usr_afi', 'owner');
  const mawuli = person('usr_mawuli', 'member'); // counter
  const yao = person('usr_yao', 'member'); // workshop
  const year = new Date().getUTCFullYear();
  const orders: Record<string, string> = {};
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId;
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? null;
  const receive = async (key: string, phone: string, name: string, line: Record<string, unknown>) => {
    const { orderId } = await done<{ orderId: string }>(afi, 'orders_receive', {
      siteId: site.siteId,
      phone,
      customerName: name,
      lines: [line],
    });
    orders[key] = orderId;
  };
  const issue = (who: typeof afi, keys: string[]) =>
    act<{ invoiceId: string; number: string; total: number }>(who, 'invoices_issue', {
      orderIds: keys.map((key) => orders[key]),
    });
  const get = (invoiceId: string) =>
    done<{ invoice: Invoice; status: string; due: number }>(afi, 'invoices_get', { invoiceId });
  const invoiceIds: Record<string, string> = {};

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
    await done(afi, 'catalog_set_price', {
      serviceId: service('Lavage et repassage'),
      articleId: article('Chemise'),
      amount: 500,
    });
    await done(afi, 'catalog_set_price', { serviceId: service('Linge au kilo'), articleId: null, amount: 600 });
    await hire(mawuli, 'counter');
    await hire(yao, 'workshop');
    const shirtsLine = { serviceId: service('Lavage et repassage'), articleId: article('Chemise'), quantity: 4 };
    const kiloLine = { serviceId: service('Linge au kilo'), articleId: null, quantity: 3.5 };
    await receive('a1', '90 12 34 56', 'Mme Adjovi', shirtsLine); // 2 000
    await receive('h1', '91 00 00 01', 'Hôtel Sarakawa', kiloLine); // 2 100
    await receive('h2', '91 00 00 01', 'Hôtel Sarakawa', shirtsLine); // 2 000
    await receive('a2', '90 12 34 56', 'Mme Adjovi', kiloLine); // 2 100
  }, 240_000);

  afterAll(async () => {
    await db.drop();
  });

  it('an invoice on demand for one deposit: its number, its lines, what is due', async () => {
    const issued = await issue(mawuli, ['a1']);
    expect(issued).toEqual({ ok: true, output: { invoiceId: expect.any(String), number: `F-${year}-0001`, total: 2_000 } });
    if (!issued.ok) return;
    invoiceIds.f1 = issued.output.invoiceId;
    const { invoice, status, due } = await get(issued.output.invoiceId);
    expect(invoice).toMatchObject({
      kind: 'invoice',
      number: `F-${year}-0001`,
      customerName: 'Mme Adjovi',
      customerPhone: '+22890123456',
      total: 2_000,
      net: 2_000,
      vat: 0,
      paid: 0,
      credited: false,
    });
    expect(invoice.seller).toMatchObject({ name: 'Pressing Afi', legalName: '', taxId: '' });
    expect(invoice.lines).toMatchObject([{ kind: 'item', quantity: 4, label: 'Chemise · Lavage et repassage', amount: 2_000 }]);
    expect(invoice.dueOn).toBe(dueOn(invoice.issuedOn, 15));
    expect([status, due]).toEqual(['due', 2_000]);
    expect(await done(afi, 'invoices_of_order', { orderId: orders.a1 })).toEqual({
      invoice: { invoiceId: issued.output.invoiceId, number: `F-${year}-0001` },
    });
  }, 120_000);

  it('a deposit is on one invoice; an invoice is for one customer; a refusal takes no number', async () => {
    expect(await issue(afi, ['a1'])).toEqual({ ok: false, code: 'already_invoiced' });
    expect(await issue(afi, ['h1', 'a2'])).toEqual({ ok: false, code: 'invoice_one_customer' });
    expect(await act(afi, 'invoices_issue', { orderIds: ['ord_unknown'] })).toEqual({ ok: false, code: 'not_found' });
    // The next invoice follows the first: no number was lost to the refusals.
    const grouped = await issue(afi, ['h1', 'h2']);
    expect(grouped).toMatchObject({ ok: true, output: { number: `F-${year}-0002`, total: 4_100 } });
    if (!grouped.ok) return;
    invoiceIds.f2 = grouped.output.invoiceId;
    const { invoice } = await get(grouped.output.invoiceId);
    expect(invoice.customerName).toBe('Hôtel Sarakawa');
    expect(invoice.lines).toMatchObject([
      { kind: 'order', orderNumber: 'A-0002', label: '3,5 kg Linge au kilo', amount: 2_100 },
      { kind: 'order', orderNumber: 'A-0003', label: '4 Chemise · Lavage et repassage', amount: 2_000 },
    ]);
  }, 120_000);

  it('money cashed on an invoice goes to its deposits, the oldest first — never more than is due', async () => {
    const invoiceId = invoiceIds.f2 ?? '';
    expect(await act(afi, 'invoices_cash', { invoiceId, amount: 4_101, method: 'mobile_money' })).toEqual({
      ok: false,
      code: 'payment_above_balance',
    });
    expect(await done(afi, 'invoices_cash', { invoiceId, amount: 2_500, method: 'mobile_money' })).toMatchObject({
      paid: 2_500,
      due: 1_600,
    });
    const first = await done<Order>(afi, 'orders_get', { orderId: orders.h1 });
    const second = await done<Order>(afi, 'orders_get', { orderId: orders.h2 });
    expect([first.paid, second.paid]).toEqual([2_100, 400]);
    // A payment taken on the deposit itself counts on its invoice too.
    await done(afi, 'payments_record', { orderId: orders.h2, amount: 1_600, method: 'mobile_money' });
    expect(await get(invoiceId)).toMatchObject({ status: 'paid', due: 0, invoice: { paid: 4_100 } });
    // Cash follows the till's rule, like any payment: no open till, no cash.
    const cash = await act(afi, 'invoices_cash', { invoiceId: invoiceIds.f1, amount: 500, method: 'cash' });
    expect(cash.ok).toBe(false);
  }, 120_000);

  it('a credit note cancels an invoice: it stays as written, and its deposit can be billed again', async () => {
    const invoiceId = invoiceIds.f1 ?? '';
    expect(await act(mawuli, 'invoices_credit', { invoiceId, reason: 'erreur de client' })).toEqual({
      ok: false,
      code: 'not_allowed',
    });
    const credit = await done<{ invoiceId: string; number: string; credits: string }>(afi, 'invoices_credit', {
      invoiceId,
      reason: 'erreur de client',
    });
    expect(credit).toMatchObject({ number: `A-${year}-0001`, credits: `F-${year}-0001` });
    const note = (await get(credit.invoiceId)).invoice;
    expect(note).toMatchObject({ kind: 'credit', total: -2_000, reason: 'erreur de client', creditsInvoiceId: invoiceId });
    expect(note.lines).toMatchObject([{ amount: -2_000 }]);
    // The invoice is as it was written, and says what cancelled it.
    const cancelled = await get(invoiceId);
    expect(cancelled).toMatchObject({ status: 'credited', due: 0 });
    expect(cancelled.invoice).toMatchObject({ total: 2_000, credited: true, creditedByNumber: `A-${year}-0001` });
    expect(cancelled.invoice.lines).toMatchObject([{ amount: 2_000 }]);
    // Cancelled once; a credit note is neither cancelled nor cashed.
    expect(await act(afi, 'invoices_credit', { invoiceId, reason: 'encore' })).toEqual({ ok: false, code: 'already_credited' });
    expect(await act(afi, 'invoices_credit', { invoiceId: credit.invoiceId, reason: 'x' })).toEqual({
      ok: false,
      code: 'credit_note_not_credited',
    });
    expect(await act(afi, 'invoices_cash', { invoiceId, amount: 100, method: 'mobile_money' })).toEqual({
      ok: false,
      code: 'already_credited',
    });
    // Its deposit is free again, and the series goes on without a gap.
    expect(await done(afi, 'invoices_of_order', { orderId: orders.a1 })).toEqual({ invoice: null });
    expect(await issue(afi, ['a1'])).toMatchObject({ ok: true, output: { number: `F-${year}-0003` } });
  }, 120_000);

  it('the mentions and the VAT are the laundry’s; an invoice keeps those of its day', async () => {
    expect(await act(mawuli, 'invoices_set_settings', { legalName: 'X' })).toEqual({ ok: false, code: 'not_allowed' });
    await done(afi, 'invoices_set_settings', {
      legalName: 'Pressing Afi SARL',
      taxId: '1000123456',
      tradeRegister: 'TG-LOM 2020 B 123',
      address: 'Agoè, Lomé',
      footer: 'Mobile Money : 90 00 00 00',
      vatPercent: 18,
      paymentDays: 30,
    });
    const issued = await issue(afi, ['a2']);
    expect(issued).toMatchObject({ ok: true, output: { number: `F-${year}-0004`, total: 2_100 } });
    if (!issued.ok) return;
    const { invoice } = await get(issued.output.invoiceId);
    // The price did not move: the tax is inside it.
    expect(invoice).toMatchObject({ total: 2_100, vatPercent: 18, vat: 320, net: 1_780 });
    expect(invoice.seller).toMatchObject({ legalName: 'Pressing Afi SARL', taxId: '1000123456', tradeRegister: 'TG-LOM 2020 B 123' });
    expect(invoice.dueOn).toBe(dueOn(invoice.issuedOn, 30));
    // The paid invoice of the hotel was written before: it keeps its day's mentions.
    expect((await get(invoiceIds.f2 ?? '')).invoice).toMatchObject({ vatPercent: 0, vat: 0, seller: { legalName: '' } });
  }, 120_000);

  it('a customer’s account: her invoices, what is not billed yet, what she owes in all', async () => {
    const adjovi = (await done<Order>(afi, 'orders_get', { orderId: orders.a1 })).customerId;
    const account = await done<CustomerAccount>(afi, 'invoices_account', { customerId: adjovi });
    // F-0003 (2 000) and F-0004 (2 100) are due; F-0001 was cancelled; nothing is left unbilled.
    expect(account.due).toBe(4_100);
    expect(account.uninvoiced).toEqual([]);
    expect(account.invoices.map((invoice) => invoice.number).sort()).toEqual([
      `A-${year}-0001`,
      `F-${year}-0001`,
      `F-${year}-0003`,
      `F-${year}-0004`,
    ]);
    const all = await done<InvoiceSummary[]>(afi, 'invoices_list', {});
    expect(all).toHaveLength(5);
  }, 120_000);

  it('reading is for who may; an agent prepares an invoice or a credit note, and never cashes', async () => {
    expect(await act(yao, 'invoices_list', {})).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(yao, 'invoices_issue', { orderIds: [orders.a1] })).toEqual({ ok: false, code: 'not_allowed' });
    for (const [name, input] of [
      ['invoices_issue', { orderIds: [orders.a1] }],
      ['invoices_credit', { invoiceId: invoiceIds.f2, reason: 'test' }],
      ['invoices_set_settings', { legalName: 'Autre' }],
    ] as const) {
      const prepared = await asPerson(afi, () => registry.invoke({ ...agentFor(afi), name, input }));
      expect(prepared, name).toMatchObject({ status: 'draft' });
    }
    const cashing = await asPerson(afi, () =>
      registry.invoke({
        ...agentFor(afi),
        name: 'invoices_cash',
        input: { invoiceId: invoiceIds.f2, amount: 100, method: 'mobile_money' },
      }),
    );
    expect(cashing.status).not.toBe('done');
  }, 120_000);

  it('one laundry’s invoices are never another’s', async () => {
    const tables = ['invoice_settings', 'invoice_counters', 'invoices', 'invoice_lines', 'invoice_orders'];
    const chain = (table: string, org: string): string[] => {
      const id = `${table}_${org}`;
      const n = tables.indexOf(table);
      const customer = `insert into customers (customer_id, organization_id, phone, name)
                        values ('cus_${id}', '${org}', '+2289100000${n}', 'x')`;
      const invoice = `insert into invoices (invoice_id, organization_id, kind, number, customer_id, customer_name,
                                             customer_phone, seller, issued_on, net, vat, total, created_by)
                       values ('inv_${id}', '${org}', 'invoice', 'F-${id}', 'cus_${id}', 'x', '+22891000000', '{}',
                               current_date, 100, 0, 100, 'usr_x')`;
      if (table === 'invoice_settings') return [`insert into invoice_settings (organization_id) values ('${org}')`];
      if (table === 'invoice_counters') {
        return [`insert into invoice_counters (organization_id, kind, year) values ('${org}', 'invoice', 2026)`];
      }
      if (table === 'invoices') return [customer, invoice];
      if (table === 'invoice_lines') {
        return [
          customer,
          invoice,
          `insert into invoice_lines (line_id, organization_id, invoice_id, position, kind, amount)
           values ('inl_${id}', '${org}', 'inv_${id}', 0, 'item', 100)`,
        ];
      }
      return [
        customer,
        invoice,
        `insert into sites (site_id, organization_id, name, code, kind)
         values ('sit_${id}', '${org}', 'x', 'Z', 'counter_plant')`,
        `insert into orders (order_id, organization_id, site_id, number, customer_id, subtotal, total,
                             promised_at, created_by)
         values ('ord_${id}', '${org}', 'sit_${id}', '${id}', 'cus_${id}', 100, 100, now(), 'usr_x')`,
        `insert into invoice_orders (organization_id, order_id, invoice_id)
         values ('${org}', 'ord_${id}', 'inv_${id}')`,
      ];
    };
    for (const table of tables) {
      await assertOrganizationIsolation({
        app: db.app,
        table,
        organizations: ['org_x', 'org_y'],
        insert: async (client, organizationId) => {
          for (const sql of chain(table, organizationId)) await client.query(sql);
        },
      });
    }
  }, 240_000);
});
