import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { Customer } from '../src/features/customers';
import { formatPhone, normalizePhone } from '../src/features/customers/domain/phone';
import type { DaySummary, Order, OrderSummary } from '../src/features/orders';
import { cancel, collect, orderNumber, payment, promisedDate, refund } from '../src/features/orders/domain/order';
import { checkDiscount, priceOrder, type PricedLine } from '../src/features/orders/domain/pricing';
import { manifest } from '../src/platform/events';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, onScreen, person } from './helpers';

// The counter's proof (specs/002-counter): a deposit keeps its real content even under a pack, its
// price is computed by one pure function, every franc has a trace, and the sensitive gestures
// belong to whoever holds the right.

let db: TestSchema;

const afi = person('usr_afi', 'owner');
const mawuli = person('usr_mawuli', 'member'); // counter
const essi = person('usr_essi', 'member'); // cashier

const shirt = (quantity: number): PricedLine => ({
  serviceId: 'svc_wash',
  articleId: 'art_shirt',
  pricing: 'per_piece',
  quantity,
  unitPrice: 500,
});
const trousers = (quantity: number): PricedLine => ({ ...shirt(quantity), articleId: 'art_trousers', unitPrice: 600 });
const jacket = (quantity: number): PricedLine => ({ ...shirt(quantity), articleId: 'art_jacket', unitPrice: 1500 });
const kilos = (quantity: number): PricedLine => ({
  serviceId: 'svc_kilo',
  articleId: null,
  pricing: 'per_kg',
  quantity,
  unitPrice: 600,
});
const business12 = { mode: 'pieces' as const, quota: 12, price: 6000, serviceIds: [] };

describe('the price of a deposit, computed by one pure function', () => {
  it('without a pack, the total is the sum of the lines', () => {
    const price = priceOrder({ lines: [shirt(4), trousers(2)] });
    expect(price).toMatchObject({ subtotal: 3200, total: 3200, packPrice: 0, supplement: 0 });
    expect(price.lines.map((line) => line.due)).toEqual([2000, 1200]);
  });

  it('a pack covers its content: six pieces out of twelve, the lines keep their real quantity', () => {
    const price = priceOrder({ lines: [shirt(4), trousers(2)], pack: business12 });
    expect(price).toMatchObject({ total: 6000, packUsed: 6, supplement: 0, coveredValue: 3200 });
    expect(price.lines.map((line) => line.covered)).toEqual([4, 2]);
  });

  it('covers the most expensive pieces first; the rest is due at its normal price', () => {
    const price = priceOrder({ lines: [shirt(10), jacket(4)], pack: business12 });
    expect(price.lines).toEqual([
      { amount: 5000, covered: 8, due: 1000 },
      { amount: 6000, covered: 4, due: 0 },
    ]);
    expect(price).toMatchObject({ packUsed: 12, supplement: 1000, total: 7000, coveredValue: 10000 });
  });

  it('a line the pack does not admit is due at its normal price', () => {
    const named = { ...business12, serviceIds: ['svc_other'] };
    expect(priceOrder({ lines: [shirt(4)], pack: named })).toMatchObject({
      packUsed: 0,
      supplement: 2000,
      total: 8000,
    });
    // A pack in pieces never covers kilos.
    expect(priceOrder({ lines: [kilos(3)], pack: business12 }).total).toBe(6000 + 1800);
  });

  it('a weight pack covers kilos up to its quota', () => {
    const family = { mode: 'weight' as const, quota: 10, price: 5000, serviceIds: [] };
    const price = priceOrder({ lines: [kilos(12.5)], pack: family });
    expect(price).toMatchObject({ packUsed: 10, supplement: 1500, total: 6500 });
    expect(priceOrder({ lines: [kilos(7.3)], pack: family })).toMatchObject({
      packUsed: 7.3,
      supplement: 0,
      total: 5000,
    });
  });

  it('express adds a percentage before the discount, which never makes the total negative', () => {
    const express = priceOrder({ lines: [shirt(4)], expressPercent: 50, discount: 500 });
    expect(express).toMatchObject({ subtotal: 2000, express: 1000, discount: 500, total: 2500 });
    expect(priceOrder({ lines: [shirt(1)], discount: 9000 })).toMatchObject({
      discount: 500,
      total: 0,
    });
  });

  it('refuses a quantity that cannot be', () => {
    expect(() => priceOrder({ lines: [shirt(0)] })).toThrow(/quantity_invalid/);
    expect(() => priceOrder({ lines: [shirt(1.5)] })).toThrow(/quantity_invalid/);
    expect(() => priceOrder({ lines: [kilos(1.5)] })).not.toThrow();
  });

  it('a discount needs a reason, and the right above the ceiling', () => {
    const price = priceOrder({ lines: [shirt(10)], discount: 1000 }); // 20 %
    const ask = (reason: string | undefined, mayExceed: boolean) => () =>
      checkDiscount(price, { reason, ceilingPercent: 10, mayExceed });
    expect(ask(undefined, true)).toThrow(/discount_needs_reason/);
    expect(ask('cliente fidèle', false)).toThrow(/discount_above_ceiling/);
    expect(ask('cliente fidèle', true)).not.toThrow();
    const small = priceOrder({ lines: [shirt(10)], discount: 500 }); // 10 %: within the ceiling
    expect(() =>
      checkDiscount(small, { reason: 'geste', ceilingPercent: 10, mayExceed: false }),
    ).not.toThrow();
  });
});

describe('the rules of a deposit and of its money', () => {
  it('numbers a deposit with the code of its site, and proposes a promised date', () => {
    expect(orderNumber('A', 412)).toBe('A-0412');
    expect(orderNumber('BE', 12345)).toBe('BE-12345');
    const from = new Date('2026-10-08T15:00:00Z');
    const settings = { promisedHours: 48, expressHours: 24 };
    expect(promisedDate(from, settings, false).toISOString()).toBe('2026-10-10T15:00:00.000Z');
    expect(promisedDate(from, settings, true).toISOString()).toBe('2026-10-09T15:00:00.000Z');
  });

  it('money never exceeds what is due, and says whether it settles the deposit', () => {
    const order = { status: 'received' as const, total: 5400, paid: 3000 };
    expect(payment(order, 1000)).toBe('deposit');
    expect(payment(order, 2400)).toBe('balance');
    expect(() => payment(order, 2401)).toThrow(/payment_above_balance/);
    expect(() => payment({ ...order, status: 'cancelled' }, 100)).toThrow(/order_cancelled/);
    expect(() => refund({ paid: 3000 }, 3001, 'erreur')).toThrow(/refund_above_paid/);
    expect(() => refund({ paid: 3000 }, 500, ' ')).toThrow(/reason_needed/);
  });

  it('hands over what is ready and paid; cancels what is open and refunded', () => {
    expect(() => collect({ status: 'received', total: 100, paid: 100 }, true)).toThrow(/order_not_ready/);
    expect(() => collect({ status: 'ready', total: 100, paid: 40 }, false)).toThrow(/balance_due/);
    expect(collect({ status: 'ready', total: 100, paid: 40 }, true)).toBe('collected');
    expect(() => cancel({ status: 'ready', paid: 0 }, 'x')).toThrow(/order_not_open/);
    expect(() => cancel({ status: 'received', paid: 500 }, 'x')).toThrow(/refund_first/);
    expect(cancel({ status: 'in_progress', paid: 0 }, 'erreur de saisie')).toBe('cancelled');
  });

  it('writes a phone one way only', () => {
    expect(normalizePhone('90 12 34 56')).toBe('+22890123456');
    expect(normalizePhone('+228 90.12.34.56')).toBe('+22890123456');
    expect(normalizePhone('0022890123456')).toBe('+22890123456');
    expect(normalizePhone('22890123456')).toBe('+22890123456');
    expect(normalizePhone('+33 6 12 34 56 78')).toBe('+33612345678');
    expect(() => normalizePhone('12')).toThrow(/phone_invalid/);
    expect(formatPhone('+22890123456')).toBe('+228 90 12 34 56');
  });
});

describe('at the counter', () => {
  let siteA: Site;
  let siteB: Site;
  let read: Catalog;
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? '';
  const line = (articleName: string, quantity: number) => ({
    serviceId: service('Lavage et repassage'),
    articleId: article(articleName),
    quantity,
  });
  const order = (orderId: string) => done<Order>(afi, 'orders_get', { orderId });
  type Received = { orderId: string; number: string; total: number; paid: number; balance: number };

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'established',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    await done(afi, 'business_save_site', { name: 'Bè', code: 'B', kind: 'counter_plant' });
    const { sites } = await done<{ sites: Site[] }>(afi, 'business_overview', {});
    siteA = sites.find((s) => s.code === 'A') as Site;
    siteB = sites.find((s) => s.code === 'B') as Site;
    read = await done<Catalog>(afi, 'catalog_read', {});
    for (const [name, amount] of [['Chemise', 500], ['Pantalon', 600], ['Veste', 1500]] as const) {
      await done(afi, 'catalog_set_price', {
        serviceId: service('Lavage et repassage'),
        articleId: article(name),
        amount,
      });
    }
    await done(afi, 'catalog_set_price', {
      serviceId: service('Linge au kilo'),
      articleId: null,
      amount: 600,
    });
    await done(afi, 'catalog_save_pack', {
      name: 'Business 12 pièces',
      mode: 'pieces',
      quota: 12,
      price: 6000,
    });
    read = await done<Catalog>(afi, 'catalog_read', {});
    await hire(mawuli, 'counter');
    await hire(essi, 'cashier');
    // A team works with open tills (specs/003-money-day): cash goes into the cashier's own.
    await done(essi, 'cash_open', { siteId: siteA.siteId, openingFloat: 0 });
    await done(afi, 'cash_open', { siteId: siteA.siteId, openingFloat: 0 });
  });

  afterAll(async () => {
    await db.drop();
  });

  it('receives a deposit: a new customer, the next number of the site, its history', async () => {
    const received = await done<Received>(mawuli, 'orders_receive', {
      siteId: siteA.siteId,
      phone: '90 12 34 56',
      customerName: 'Mme Adjovi',
      lines: [line('Chemise', 4), line('Pantalon', 2)],
    });
    expect(received).toMatchObject({ number: 'A-0001', total: 3200, paid: 0, balance: 3200 });
    const full = await order(received.orderId);
    expect(full).toMatchObject({
      customerName: 'Mme Adjovi',
      customerPhone: '+22890123456',
      status: 'received',
      pieces: 6,
    });
    expect(full.items.map((i) => [i.articleName, i.quantity, i.unitPrice, i.due])).toEqual([
      ['Chemise', 4, 500, 2000],
      ['Pantalon', 2, 600, 1200],
    ]);
    expect(full.events.map((e) => e.kind)).toEqual(['received']);
    expect(full.events[0]).toMatchObject({ actorId: 'usr_mawuli', actorKind: 'person' });
  });

  it('recognizes a known phone however it is typed, and never asks her name twice', async () => {
    const again = await done<Received>(mawuli, 'orders_receive', {
      siteId: siteA.siteId,
      phone: '+228 90.12.34.56',
      lines: [line('Chemise', 1)],
    });
    expect(again.number).toBe('A-0002');
    const customers = await done<Customer[]>(afi, 'customers_search', { text: 'adjovi' });
    expect(customers).toHaveLength(1);
    expect((await order(again.orderId)).customerId).toBe(customers[0]?.customerId);
    // An unknown phone without a name is not a customer yet.
    expect(
      await act(mawuli, 'orders_receive', {
        siteId: siteA.siteId,
        phone: '91 00 00 00',
        lines: [line('Chemise', 1)],
      }),
    ).toEqual({ ok: false, code: 'customer_name_needed' });
  });

  it('each site has its own series, and a refused deposit skips no number', async () => {
    const atB = await done<Received>(afi, 'orders_receive', {
      siteId: siteB.siteId,
      phone: '90 12 34 56',
      lines: [line('Chemise', 2)],
    });
    expect(atB.number).toBe('B-0001');
    // « Robe » has no price for this service: the deposit is refused, naming the article.
    const refused = await act(mawuli, 'orders_receive', {
      siteId: siteA.siteId,
      phone: '90 12 34 56',
      lines: [line('Robe', 1)],
    });
    expect(refused).toEqual({ ok: false, code: 'not_sold' });
    const next = await done<Received>(mawuli, 'orders_receive', {
      siteId: siteA.siteId,
      phone: '90 12 34 56',
      lines: [line('Chemise', 1)],
    });
    expect(next.number).toBe('A-0003');
  });

  it('keeps the real content under a pack, and the money taken with the deposit', async () => {
    const pack = read.packs[0];
    const received = await done<Received>(afi, 'orders_receive', {
      siteId: siteA.siteId,
      phone: '92 22 22 22',
      customerName: 'M. Kpodar',
      lines: [line('Chemise', 10), line('Veste', 4)],
      packId: pack?.packId,
      payment: { amount: 3000, method: 'mobile_money' },
    });
    expect(received).toMatchObject({ total: 7000, paid: 3000, balance: 4000 });
    const full = await order(received.orderId);
    expect(full).toMatchObject({ packName: 'Business 12 pièces', packPrice: 6000, supplement: 1000, pieces: 14 });
    expect(full.items.map((i) => [i.articleName, i.quantity, i.covered, i.due])).toEqual([
      ['Chemise', 10, 8, 1000],
      ['Veste', 4, 4, 0],
    ]);
    expect(full.payments).toMatchObject([{ amount: 3000, method: 'mobile_money', kind: 'deposit' }]);
    expect(full.events.map((e) => e.kind)).toEqual(['received', 'paid']);
  });

  it('a later change of the catalogue never touches a past deposit', async () => {
    const [first] = await done<OrderSummary[]>(afi, 'orders_list', { text: 'A-0001' });
    await done(afi, 'catalog_set_price', {
      serviceId: service('Lavage et repassage'),
      articleId: article('Chemise'),
      amount: 700,
    });
    const kept = await order(first?.orderId ?? '');
    expect(kept.total).toBe(3200);
    expect(kept.items[0]).toMatchObject({ unitPrice: 500 });
    await done(afi, 'catalog_set_price', {
      serviceId: service('Lavage et repassage'),
      articleId: article('Chemise'),
      amount: 500,
    });
  });

  it('the same gesture sent twice creates one deposit', async () => {
    const invoke = () =>
      asPerson(afi, () =>
        registry.invoke({
          ...onScreen(afi),
          name: 'orders_receive',
          idempotencyKey: 'counter-double-tap-1',
          input: { siteId: siteB.siteId, phone: '90 12 34 56', lines: [line('Pantalon', 1)] },
        }),
      );
    const first = await invoke();
    const second = await invoke();
    expect(first).toMatchObject({ status: 'done', output: { number: 'B-0002' } });
    expect(second).toMatchObject({ status: 'done', output: { number: 'B-0002' } });
    const atB = await done<OrderSummary[]>(afi, 'orders_list', { siteId: siteB.siteId });
    expect(atB.map((o) => o.number).sort()).toEqual(['B-0001', 'B-0002']);
  });

  it('a discount above the ceiling is the manager’s and the owner’s', async () => {
    const big = {
      siteId: siteA.siteId,
      phone: '90 12 34 56',
      lines: [line('Chemise', 10)],
      discount: 1000,
      discountReason: 'cliente fidèle',
    };
    expect(await act(mawuli, 'orders_receive', big)).toEqual({
      ok: false,
      code: 'discount_above_ceiling',
    });
    expect(await act(mawuli, 'orders_receive', { ...big, discountReason: undefined, discount: 100 })).toEqual({
      ok: false,
      code: 'discount_needs_reason',
    });
    const within = await done<Received>(mawuli, 'orders_receive', { ...big, discount: 500 });
    expect(within.total).toBe(4500);
    const granted = await done<Received>(afi, 'orders_receive', big);
    expect(granted.total).toBe(4000);
  });

  it('a person works at her sites only, and a plant takes no deposit', async () => {
    const team = await done<{ staff: { staffId: string; userId: string }[] }>(afi, 'team_read', {});
    const member = team.staff.find((s) => s.userId === 'usr_mawuli');
    await done(afi, 'team_set_role', {
      staffId: member?.staffId,
      role: 'counter',
      siteIds: [siteA.siteId],
    });
    expect(
      await act(mawuli, 'orders_receive', {
        siteId: siteB.siteId,
        phone: '90 12 34 56',
        lines: [line('Chemise', 1)],
      }),
    ).toEqual({ ok: false, code: 'not_your_site' });
    const counter = await done<{ sites: Site[] }>(mawuli, 'orders_counter', {});
    expect(counter.sites.map((s) => s.code)).toEqual(['A']);
  });

  describe('every franc has a trace', () => {
    let deposit: Received;

    it('the counter role receives but does not cash; the cashier cashes', async () => {
      deposit = await done<Received>(mawuli, 'orders_receive', {
        siteId: siteA.siteId,
        phone: '93 33 33 33',
        customerName: 'Mme Lawson',
        lines: [line('Veste', 2), line('Pantalon', 4)],
      });
      expect(deposit.total).toBe(5400);
      const money = { orderId: deposit.orderId, amount: 3000, method: 'cash' };
      expect(await act(mawuli, 'payments_record', money)).toEqual({ ok: false, code: 'not_allowed' });
      expect(await done(essi, 'payments_record', money)).toMatchObject({ paid: 3000, balance: 2400 });
      expect(
        await act(essi, 'payments_record', { ...money, amount: 2401 }),
      ).toEqual({ ok: false, code: 'payment_above_balance' });
    });

    it('an agent never cashes: it prepares a draft a person confirms', async () => {
      const prepared = await asPerson(essi, () =>
        registry.invoke({
          ...agentFor(essi),
          name: 'payments_record',
          input: { orderId: deposit.orderId, amount: 400, method: 'cash' },
        }),
      );
      expect(prepared).toMatchObject({ status: 'draft' });
      expect((await order(deposit.orderId)).paid).toBe(3000);
    });

    it('a deposit is handed over once ready and paid — the balance cashed in the same gesture', async () => {
      expect(await act(essi, 'orders_collect', { orderId: deposit.orderId })).toEqual({
        ok: false,
        code: 'order_not_ready',
      });
      // Marking ready is the workshop's gesture, not the cashier's.
      expect(await act(essi, 'orders_mark_ready', { orderId: deposit.orderId })).toEqual({
        ok: false,
        code: 'not_allowed',
      });
      await done(afi, 'orders_mark_ready', { orderId: deposit.orderId, location: 'Rayon 3' });
      expect(await act(essi, 'orders_collect', { orderId: deposit.orderId })).toEqual({
        ok: false,
        code: 'balance_due',
      });
      const handed = await done(essi, 'orders_collect', {
        orderId: deposit.orderId,
        payment: { amount: 2400, method: 'mobile_money' },
      });
      expect(handed).toMatchObject({ status: 'collected', balance: 0 });
      const full = await order(deposit.orderId);
      expect(full).toMatchObject({ status: 'collected', paid: 5400, location: 'Rayon 3' });
      expect(full.payments.map((p) => [p.amount, p.method, p.kind])).toEqual([
        [3000, 'cash', 'deposit'],
        [2400, 'mobile_money', 'balance'],
      ]);
      expect(full.events.map((e) => e.kind)).toEqual(['received', 'paid', 'ready', 'paid', 'collected']);
      // Over: nothing changes it any more.
      expect(await act(afi, 'orders_mark_ready', { orderId: deposit.orderId })).toEqual({
        ok: false,
        code: 'order_not_open',
      });
    });

    it('the owner may release a deposit unpaid; the history says how much was left', async () => {
      const unpaid = await done<Received>(afi, 'orders_receive', {
        siteId: siteA.siteId,
        phone: '93 33 33 33',
        lines: [line('Veste', 1)],
      });
      await done(afi, 'orders_mark_ready', { orderId: unpaid.orderId });
      expect(await done(afi, 'orders_collect', { orderId: unpaid.orderId })).toMatchObject({
        status: 'collected',
        balance: 1500,
      });
      const full = await order(unpaid.orderId);
      expect(full.events.at(-1)).toMatchObject({ kind: 'collected', detail: { unpaid: 1500 } });
    });

    it('a cancellation needs a reason and the right, and money given back first', async () => {
      const paid = await done<Received>(afi, 'orders_receive', {
        siteId: siteA.siteId,
        phone: '93 33 33 33',
        lines: [line('Chemise', 2)],
        payment: { amount: 1000, method: 'cash' },
      });
      const reason = { orderId: paid.orderId, reason: 'erreur de saisie' };
      expect(await act(mawuli, 'orders_cancel', reason)).toEqual({ ok: false, code: 'not_allowed' });
      expect(await act(afi, 'orders_cancel', { orderId: paid.orderId, reason: '' })).toEqual({
        ok: false,
        code: 'invalid_input',
      });
      expect(await act(afi, 'orders_cancel', reason)).toEqual({ ok: false, code: 'refund_first' });
      const refundOf = (amount: number) => ({
        orderId: paid.orderId,
        amount,
        method: 'cash',
        reason: 'dépôt annulé',
      });
      expect(await act(essi, 'payments_refund', refundOf(1000))).toEqual({
        ok: false,
        code: 'not_allowed',
      });
      expect(await act(afi, 'payments_refund', refundOf(1001))).toEqual({
        ok: false,
        code: 'refund_above_paid',
      });
      await done(afi, 'payments_refund', refundOf(1000));
      await done(afi, 'orders_cancel', reason);
      const full = await order(paid.orderId);
      expect(full).toMatchObject({ status: 'cancelled', paid: 0, cancelReason: 'erreur de saisie' });
      expect(full.events.map((e) => e.kind)).toEqual(['received', 'paid', 'refunded', 'cancelled']);
      expect(
        await act(afi, 'payments_record', { orderId: paid.orderId, amount: 100, method: 'cash' }),
      ).toEqual({ ok: false, code: 'order_cancelled' });
    });
  });

  it('an agent prepares a deposit from what it heard; nothing exists until a person validates', async () => {
    const before = await done<OrderSummary[]>(afi, 'orders_list', {});
    const prepared = await asPerson(mawuli, () =>
      registry.invoke({
        ...agentFor(mawuli),
        name: 'orders_receive',
        input: {
          siteId: siteA.siteId,
          phone: '90 12 34 56',
          lines: [line('Chemise', 3)],
        },
        provenance: { lines: { source: 'voice', by: { kind: 'agent', id: 'agt_mcp' } } },
      }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect(await done<OrderSummary[]>(afi, 'orders_list', {})).toHaveLength(before.length);
  });

  it('counts the day: deposits, pieces, money cashed, what waits, what is owed', async () => {
    const today = await done<DaySummary & { day: string }>(afi, 'orders_today', {});
    const all = await done<OrderSummary[]>(afi, 'orders_list', { limit: 200 });
    const live = all.filter((o) => o.status !== 'cancelled');
    expect(today.received).toBe(live.length);
    expect(today.pieces).toBe(live.reduce((sum, o) => sum + o.pieces, 0));
    expect(today.outstanding).toBe(live.reduce((sum, o) => sum + o.total - o.paid, 0));
    expect(today.cashed).toBe(all.reduce((sum, o) => sum + o.paid, 0));
    expect(today.ready).toBe(0);
    const atB = await done<DaySummary>(afi, 'orders_today', { siteId: siteB.siteId });
    expect(atB.received).toBe(2);
    const yesterday = await done<DaySummary>(afi, 'orders_today', { day: '2026-01-01' });
    expect(yesterday).toMatchObject({ received: 0, cashed: 0 });
  });

  it('tells the center facts only: no name, no phone, no price', async () => {
    expect(manifest().emits?.map((e) => e.type)).toEqual([
      'order.received',
      'order.ready',
      'order.collected',
    ]);
    const { rows } = await db.owner.query<{ envelope: { type: string; data: object } }>(
      `select envelope from ${db.schema}.kete_center_outbox order by created_at`,
    );
    expect(rows.map((r) => r.envelope.type)).toEqual(
      expect.arrayContaining(['order.received', 'order.ready', 'order.collected']),
    );
    const said = JSON.stringify(rows.map((r) => r.envelope));
    for (const secret of ['Adjovi', 'Kpodar', 'Lawson', '22890123456', '"total"', '"amount"']) {
      expect(said).not.toContain(secret);
    }
  });

  it('keeps each organization’s customers, deposits and money to itself (RLS)', async () => {
    const tables = ['customers', 'orders', 'order_items', 'payments', 'order_events'];
    // Each table is proven with its own chain of rows: a site, a customer, a deposit, then itself.
    const chain = (table: string, org: string) => {
      const id = `${table}_${org}`;
      const upTo = (depth: number, rows: string[]) => rows.slice(0, depth);
      return upTo(
        { customers: 2, orders: 3, order_items: 4, payments: 4, order_events: 4 }[table] ?? 0,
        [
          `insert into sites (site_id, organization_id, name, code, kind)
           values ('sit_${id}', '${org}', 'x', 'X${String.fromCharCode(65 + tables.indexOf(table))}', 'counter_plant')`,
          `insert into customers (customer_id, organization_id, phone, name)
           values ('cus_${id}', '${org}', '+2289000000${tables.indexOf(table)}', 'x')`,
          `insert into orders (order_id, organization_id, site_id, number, customer_id, subtotal, total,
                               promised_at, created_by)
           values ('ord_${id}', '${org}', 'sit_${id}', '${id}', 'cus_${id}', 100, 100, now(), 'usr_x')`,
          {
            order_items: `insert into order_items (item_id, organization_id, order_id, position,
                             service_id, service_name, pricing, quantity, unit_price, amount, due)
                           values ('itm_${id}', '${org}', 'ord_${id}', 0, 'svc_x', 'x', 'per_kg', 1, 100, 100, 100)`,
            payments: `insert into payments (payment_id, organization_id, order_id, site_id, amount,
                          method, kind, created_by)
                        values ('pay_${id}', '${org}', 'ord_${id}', 'sit_${id}', 50, 'cash', 'deposit', 'usr_x')`,
            order_events: `insert into order_events (event_id, organization_id, order_id, kind,
                              actor_id, actor_kind)
                            values ('oev_${id}', '${org}', 'ord_${id}', 'received', 'usr_x', 'person')`,
          }[table] ?? '',
        ],
      );
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
  }, 180_000);
});
