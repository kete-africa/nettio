import type { KeteIdentity } from '@kete/auth';
import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AccountView } from '../src/features/accounts';
import {
  balanceOf,
  checkQuoteDecision,
  checkTopUp,
  monthBounds,
  periodOf,
  quoteNumber,
  quoteState,
  runsIn,
  withCustomerPrices,
} from '../src/features/accounts/domain/accounts';
import type { Quote } from '../src/features/accounts/infrastructure/accounts.tables';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { Invoice } from '../src/features/invoices';
import type { CashSession } from '../src/features/money';
import type { Order } from '../src/features/orders';
import { transaction } from '../src/platform/db';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// A customer's account (specs/026-accounts): her own prices, the credit she paid ahead, a
// subscription that recharges it, quotes, and a company invoiced once a month.

const code = (work: () => void): string | null => {
  try {
    work();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'thrown';
  }
};

describe('a customer’s account, pure rules', () => {
  it('her own price replaces the catalogue’s — for that service and article only', () => {
    const catalogue = [
      { serviceId: 'srv_wash', articleId: 'art_shirt', amount: 500 },
      { serviceId: 'srv_wash', articleId: 'art_suit', amount: 2_500 },
      { serviceId: 'srv_kilo', articleId: null, amount: 600 },
    ];
    const hers = [
      { serviceId: 'srv_wash', articleId: 'art_shirt', amount: 350 },
      { serviceId: 'srv_kilo', articleId: null, amount: 450 },
      { serviceId: 'srv_dry', articleId: 'art_dress', amount: 3_000 },
    ];
    expect(withCustomerPrices(catalogue, hers)).toEqual([hers[0], catalogue[1], hers[1], hers[2]]);
    expect(withCustomerPrices(catalogue, [])).toEqual(catalogue);
  });

  it('credit is what she paid in, minus what her deposits took', () => {
    expect(
      balanceOf([
        { kind: 'top_up', amount: 10_000 },
        { kind: 'spend', amount: 2_000 },
        { kind: 'returned', amount: 500 },
      ]),
    ).toBe(8_500);
    expect(balanceOf([])).toBe(0);
    expect(code(() => checkTopUp({ cashed: 5_000, credit: 5_500, method: 'cash' }))).toBeNull();
    expect(code(() => checkTopUp({ cashed: 5_000, credit: 4_999, method: 'cash' }))).toBe('credit_below_cashed');
    expect(code(() => checkTopUp({ cashed: 0, credit: 100, method: 'cash' }))).toBe('amount_invalid');
    expect(code(() => checkTopUp({ cashed: 100, credit: 100, method: 'credit' }))).toBe('invalid_input');
  });

  it('a subscription runs from its first month to its last', () => {
    const subscription = { startedOn: '2026-10-09', endedOn: null };
    expect(runsIn(subscription, '2026-10')).toBe(true);
    expect(runsIn(subscription, '2027-03')).toBe(true);
    expect(runsIn(subscription, '2026-09')).toBe(false);
    expect(runsIn({ ...subscription, endedOn: '2026-11-02' }, '2026-11')).toBe(true);
    expect(runsIn({ ...subscription, endedOn: '2026-11-02' }, '2026-12')).toBe(false);
    expect(periodOf(new Date('2026-10-09T10:00:00Z'))).toBe('2026-10');
  });

  it('a quote is numbered by year, and is no longer an offer after its date', () => {
    expect(quoteNumber(2026, 42)).toBe('D-2026-0042');
    expect(quoteState({ status: 'open', validUntil: '2026-10-09' }, '2026-10-09')).toBe('open');
    expect(quoteState({ status: 'open', validUntil: '2026-10-08' }, '2026-10-09')).toBe('expired');
    expect(quoteState({ status: 'accepted', validUntil: '2026-10-08' }, '2026-10-09')).toBe('accepted');
    expect(code(() => checkQuoteDecision({ status: 'open', validUntil: '2026-10-08' }, '2026-10-09'))).toBe('quote_expired');
    expect(code(() => checkQuoteDecision({ status: 'refused', validUntil: '2026-12-01' }, '2026-10-09'))).toBe('already_decided');
    expect(monthBounds('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
    expect(monthBounds('2026-02')).toEqual({ from: '2026-02-01', to: '2026-03-01' });
  });
});

describe('customers, companies and what they pay ahead', () => {
  let db: TestSchema;
  let site: Site;
  let read: Catalog;
  let adjovi = '';
  let hotel = '';
  let quoteId = '';
  const afi = person('usr_afi', 'owner');
  const mawuli = person('usr_mawuli', 'member'); // counter
  const essi = person('usr_essi', 'member'); // cashier
  const year = new Date().getUTCFullYear();
  const month = new Date().toISOString().slice(0, 7);
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? null;
  const shirts = (quantity: number) => ({
    serviceId: service('Lavage et repassage'),
    articleId: article('Chemise'),
    quantity,
  });
  const receive = async (phone: string, name: string, quantity = 4): Promise<Order> => {
    const { orderId } = await done<{ orderId: string }>(afi, 'orders_receive', {
      siteId: site.siteId,
      phone,
      customerName: name,
      lines: [shirts(quantity)],
    });
    return done<Order>(afi, 'orders_get', { orderId });
  };
  const account = (customerId: string) => done<AccountView>(afi, 'accounts_get', { customerId });
  const balance = async (customerId: string) => (await account(customerId)).credit.balance;
  const sql = (text: string, values: unknown[] = []) => transaction('org_acme', (client) => client.query(text, values));

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
    await done(afi, 'catalog_set_price', { serviceId: service('Lavage et repassage'), articleId: article('Chemise'), amount: 500 });
    await done(afi, 'catalog_set_price', { serviceId: service('Linge au kilo'), articleId: null, amount: 600 });
    await hire(afi, 'owner');
    await hire(mawuli, 'counter');
    await hire(essi, 'cashier');
    adjovi = (await receive('90 12 34 56', 'Mme Adjovi')).customerId;
    hotel = (await receive('91 00 00 01', 'Hôtel Sarakawa')).customerId;
  }, 300_000);

  afterAll(async () => {
    await db.drop();
  });

  it('a price agreed with a customer applies to her deposits, and to hers only', async () => {
    const price = { customerId: hotel, serviceId: service('Lavage et repassage'), articleId: article('Chemise'), amount: 350 };
    expect(await act(mawuli, 'accounts_set_price', price)).toEqual({ ok: false, code: 'not_allowed' });
    // An agent never sets a price: it prepares, the owner decides.
    const prepared = await asPerson(afi, () => registry.invoke({ ...agentFor(afi), name: 'accounts_set_price', input: price }));
    expect(prepared).toMatchObject({ status: 'draft' });
    expect((await receive('91 00 00 01', 'Hôtel Sarakawa')).total).toBe(2_000);
    await done(afi, 'accounts_set_price', price);
    expect((await receive('91 00 00 01', 'Hôtel Sarakawa')).total).toBe(1_400);
    expect((await receive('90 12 34 56', 'Mme Adjovi')).total).toBe(2_000);
    const view = await account(hotel);
    expect(view.prices).toEqual([
      {
        serviceId: price.serviceId,
        articleId: price.articleId,
        amount: 350,
        serviceName: 'Lavage et repassage',
        articleName: 'Chemise',
        catalogue: 500,
      },
    ]);
    // What the counter reads once it knows who she is.
    expect(await done(mawuli, 'accounts_counter', { customerId: hotel })).toMatchObject({
      prices: [{ serviceId: price.serviceId, articleId: price.articleId, amount: 350 }],
      credit: 0,
    });
    expect(await act(afi, 'accounts_set_price', { ...price, serviceId: 'srv_unknown' })).toEqual({ ok: false, code: 'not_found' });
    expect(await act(afi, 'accounts_set_price', { ...price, customerId: 'cus_unknown' })).toEqual({ ok: false, code: 'not_found' });
    // Removed: the catalogue applies again.
    await done(afi, 'accounts_set_price', { ...price, amount: null });
    expect((await receive('91 00 00 01', 'Hôtel Sarakawa')).total).toBe(2_000);
    await done(afi, 'accounts_set_price', price);
  }, 180_000);

  it('money paid ahead becomes credit; cash goes into the person’s till', async () => {
    const top = (who: KeteIdentity, input: Record<string, unknown>) =>
      act<{ cashed: number; credit: number; balance: number }>(who, 'credit_top_up', { customerId: adjovi, ...input });
    expect(await top(mawuli, { cashed: 10_000, method: 'mobile_money' })).toEqual({
      ok: true,
      output: { customerId: adjovi, cashed: 10_000, credit: 10_000, balance: 10_000 },
    });
    // A bonus is the laundry's gift: more credit than money, never less.
    expect(await top(mawuli, { cashed: 5_000, credit: 5_500, method: 'mobile_money' })).toMatchObject({
      ok: true,
      output: { balance: 15_500 },
    });
    expect(await top(mawuli, { cashed: 5_000, credit: 4_000, method: 'mobile_money' })).toEqual({
      ok: false,
      code: 'credit_below_cashed',
    });
    // Cash needs an open till: it must be counted somewhere.
    expect(await top(essi, { cashed: 2_000, method: 'cash' })).toEqual({ ok: false, code: 'cash_session_needed' });
    await done(essi, 'cash_open', { siteId: site.siteId, openingFloat: 1_000 });
    expect(await top(essi, { cashed: 2_000, method: 'cash' })).toMatchObject({ ok: true, output: { balance: 17_500 } });
    const [till] = await done<CashSession[]>(essi, 'cash_sessions', {});
    expect(till).toMatchObject({ cashIn: 2_000, expected: 3_000 });
    // An agent never takes money: it prepares.
    const prepared = await asPerson(mawuli, () =>
      registry.invoke({ ...agentFor(mawuli), name: 'credit_top_up', input: { customerId: adjovi, cashed: 1_000, method: 'card' } }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect(await balance(adjovi)).toBe(17_500);
  }, 180_000);

  it('a deposit is paid with her credit — never beyond it — and a refund gives it back', async () => {
    const deposit = await receive('90 12 34 56', 'Mme Adjovi');
    const pay = (amount: number, orderId = deposit.orderId) =>
      act<{ paid: number; balance: number }>(afi, 'payments_record', { orderId, amount, method: 'credit' });
    expect(await pay(1_500)).toMatchObject({ ok: true, output: { paid: 1_500, balance: 500 } });
    expect(await balance(adjovi)).toBe(16_000);
    // Someone with no credit cannot pay with it.
    const other = await receive('91 00 00 01', 'Hôtel Sarakawa');
    expect(await pay(100, other.orderId)).toEqual({ ok: false, code: 'credit_insufficient' });
    expect((await done<Order>(afi, 'orders_get', { orderId: other.orderId })).paid).toBe(0);
    await done(afi, 'payments_refund', { orderId: deposit.orderId, amount: 500, method: 'credit', reason: 'Erreur de saisie' });
    expect(await balance(adjovi)).toBe(16_500);
    const { entries } = (await account(adjovi)).credit;
    expect(entries.map((entry) => [entry.kind, entry.amount])).toEqual([
      ['returned', 500],
      ['spend', 1_500],
      ['top_up', 2_000],
      ['top_up', 5_500],
      ['top_up', 10_000],
    ]);
    // What was cashed today is the money that came in: the top-ups, not the credit spent.
    expect((await done<{ cashed: number }>(afi, 'orders_today', {})).cashed).toBe(17_000);
  }, 180_000);

  it('a subscription is cashed once a month, and its credit goes to the account', async () => {
    const subscription = { customerId: hotel, name: 'Linge du mois', amount: 15_000, credit: 18_000 };
    expect(await act(mawuli, 'subscriptions_start', subscription)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(afi, 'subscriptions_start', { ...subscription, credit: 14_000 })).toEqual({
      ok: false,
      code: 'credit_below_cashed',
    });
    const { subscriptionId } = await done<{ subscriptionId: string }>(afi, 'subscriptions_start', subscription);
    const due = await done<{ due: { subscriptionId: string }[] }>(afi, 'subscriptions_due', {});
    expect(due.due.map((each) => each.subscriptionId)).toEqual([subscriptionId]);
    expect(await done(mawuli, 'subscriptions_cash', { subscriptionId, method: 'mobile_money' })).toMatchObject({
      period: month,
      cashed: 15_000,
      credit: 18_000,
      balance: 18_000,
    });
    expect(await act(mawuli, 'subscriptions_cash', { subscriptionId, method: 'mobile_money' })).toEqual({
      ok: false,
      code: 'subscription_already_cashed',
    });
    expect(await act(mawuli, 'subscriptions_cash', { subscriptionId, period: '2020-01', method: 'card' })).toEqual({
      ok: false,
      code: 'subscription_not_running',
    });
    expect((await done<{ due: unknown[] }>(afi, 'subscriptions_due', {})).due).toEqual([]);
    expect((await account(hotel)).subscriptions[0]).toMatchObject({ name: 'Linge du mois', cashed: true, running: true });
    // Ended: its later months are not cashed any more.
    await done(afi, 'subscriptions_end', { subscriptionId });
    expect(await act(afi, 'subscriptions_end', { subscriptionId })).toEqual({ ok: false, code: 'not_found' });
    expect(await act(mawuli, 'subscriptions_cash', { subscriptionId, period: `${year + 1}-06`, method: 'card' })).toEqual({
      ok: false,
      code: 'subscription_not_running',
    });
    expect(await balance(hotel)).toBe(18_000);
  }, 180_000);

  it('a quote is written at her prices, numbered, and answered once', async () => {
    const lines = [shirts(10), { serviceId: service('Linge au kilo'), articleId: null, quantity: 5.5 }];
    expect(await act(essi, 'quotes_write', { customerId: hotel, lines })).toEqual({ ok: false, code: 'not_allowed' });
    const written = await done<{ quoteId: string; number: string; total: number }>(mawuli, 'quotes_write', {
      customerId: hotel,
      lines,
      note: 'Linge de la salle de sport',
    });
    // Ten shirts at her 350, five kilos and a half at the catalogue's 600.
    expect(written).toMatchObject({ number: `D-${year}-0001`, total: 6_800 });
    quoteId = written.quoteId;
    const { quote, state } = await done<{ quote: Quote; state: string }>(essi, 'quotes_get', { quoteId });
    expect(state).toBe('open');
    expect(quote.lines.map((line) => [line.serviceName, line.articleName, line.quantity, line.unitPrice, line.amount])).toEqual([
      ['Lavage et repassage', 'Chemise', 10, 350, 3_500],
      ['Linge au kilo', null, 5.5, 600, 3_300],
    ]);
    // A later change of price never touches a quote already written.
    await done(afi, 'accounts_set_price', { customerId: hotel, serviceId: lines[0]?.serviceId, articleId: lines[0]?.articleId, amount: 300 });
    expect((await done<{ quote: Quote }>(essi, 'quotes_get', { quoteId })).quote.total).toBe(6_800);
    expect(await done(mawuli, 'quotes_decide', { quoteId, accepted: true })).toMatchObject({ accepted: true });
    expect(await act(mawuli, 'quotes_decide', { quoteId, accepted: false })).toEqual({ ok: false, code: 'already_decided' });
    // The next one follows, and an offer past its date is not accepted any more.
    const second = await done<{ quoteId: string; number: string; total: number }>(mawuli, 'quotes_write', {
      customerId: hotel,
      lines: [shirts(2)],
    });
    expect(second).toMatchObject({ number: `D-${year}-0002`, total: 600 });
    await sql(`update quotes set valid_until = current_date - 1 where quote_id = $1`, [second.quoteId]);
    expect(await act(mawuli, 'quotes_decide', { quoteId: second.quoteId, accepted: true })).toEqual({
      ok: false,
      code: 'quote_expired',
    });
    const listed = await done<{ quotes: { number: string; state: string }[] }>(essi, 'quotes_list', {});
    expect(listed.quotes.map((each) => [each.number, each.state])).toEqual([
      [`D-${year}-0002`, 'expired'],
      [`D-${year}-0001`, 'accepted'],
    ]);
    // What the laundry does not sell is not quoted.
    expect(
      await act(mawuli, 'quotes_write', {
        customerId: hotel,
        lines: [{ serviceId: service('Lavage et repassage'), articleId: article('Pantalon'), quantity: 1 }],
      }),
    ).toEqual({ ok: false, code: 'not_sold' });
  }, 180_000);

  it('a company is invoiced once for its month, with its own mentions and its own delay', async () => {
    const terms = {
      customerId: hotel,
      legalName: 'Hôtel Sarakawa SA',
      taxId: '1000999',
      address: 'Bd du Mono, Lomé',
      monthlyInvoice: true,
      paymentDays: 45,
    };
    expect(await act(mawuli, 'accounts_set_terms', terms)).toEqual({ ok: false, code: 'not_allowed' });
    await done(afi, 'accounts_set_terms', terms);
    expect((await account(hotel)).terms).toEqual({
      legalName: 'Hôtel Sarakawa SA',
      taxId: '1000999',
      address: 'Bd du Mono, Lomé',
      monthlyInvoice: true,
      paymentDays: 45,
    });
    const preview = await done<{ customers: { customerId: string; name: string; orders: number }[] }>(
      afi,
      'invoices_month_preview',
      { month },
    );
    expect(preview.customers).toHaveLength(1);
    const waiting = preview.customers[0]?.orders ?? 0;
    expect(waiting).toBeGreaterThanOrEqual(4);
    // An agent prepares the month; it issues nothing.
    const prepared = await asPerson(afi, () => registry.invoke({ ...agentFor(afi), name: 'invoices_month_run', input: { month } }));
    expect(prepared).toMatchObject({ status: 'draft' });
    const run = await done<{ issued: { customerName: string; invoiceId: string; total: number; orders: number }[] }>(
      afi,
      'invoices_month_run',
      { month },
    );
    expect(run.issued).toHaveLength(1);
    expect(run.issued[0]).toMatchObject({ customerName: 'Hôtel Sarakawa', orders: waiting });
    const { invoice } = await done<{ invoice: Invoice }>(afi, 'invoices_get', { invoiceId: run.issued[0]?.invoiceId });
    expect(invoice.customerName).toBe('Hôtel Sarakawa SA');
    expect(invoice.customerMentions).toBe('NIF 1000999\nBd du Mono, Lomé');
    expect(invoice.lines).toHaveLength(waiting);
    expect(invoice.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(invoice.total);
    const days = (Date.parse(invoice.dueOn ?? '') - Date.parse(invoice.issuedOn)) / 86_400_000;
    expect(days).toBe(45);
    // Nothing is invoiced twice; a customer who pays at each deposit is not in the run.
    expect((await done<{ issued: unknown[] }>(afi, 'invoices_month_run', { month })).issued).toEqual([]);
  }, 180_000);

  it('one laundry’s terms, prices, credit, subscriptions and quotes are never another’s', async () => {
    const rows: [string, (organizationId: string) => string][] = [
      ['customer_terms', (o) => `(organization_id, customer_id) values ('${o}', '${hotel}')`],
      ['customer_prices', (o) => `(organization_id, customer_id, service_id, amount) values ('${o}', '${hotel}', 'srv_x', 100)`],
      [
        'subscriptions',
        (o) =>
          `(subscription_id, organization_id, customer_id, name, amount, credit, created_by) values ('sub_${o}', '${o}', '${hotel}', 'x', 100, 100, 'usr_x')`,
      ],
      [
        'credit_entries',
        (o) =>
          `(entry_id, organization_id, customer_id, kind, amount, created_by) values ('crd_${o}', '${o}', '${hotel}', 'top_up', 100, 'usr_x')`,
      ],
      ['quote_counters', (o) => `(organization_id, year, next_seq) values ('${o}', 2026, 2)`],
      [
        'quotes',
        (o) =>
          `(quote_id, organization_id, number, customer_id, customer_name, valid_until, total, created_by) values ('quo_${o}', '${o}', 'D-1', '${hotel}', 'x', current_date, 0, 'usr_x')`,
      ],
      [
        'quote_lines',
        (o) =>
          `(line_id, organization_id, quote_id, position, service_name, pricing, quantity, unit_price, amount) values ('qli_${o}', '${o}', '${quoteId}', 0, 'x', 'per_piece', 1, 100, 100)`,
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
