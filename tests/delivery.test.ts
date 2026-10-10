import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { DeliveryBoard } from '../src/features/delivery';
import { checkClose, checkPlan, checkProof, checkStart, roundOf } from '../src/features/delivery/domain/delivery';
import type { Delivery } from '../src/features/delivery/infrastructure/delivery.tables';
import type { Invoice } from '../src/features/invoices';
import type { CashSession } from '../src/features/money';
import type { Order } from '../src/features/orders';
import { transaction } from '../src/platform/db';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// Collecting and delivering (specs/027-delivery): zones and their fees, a trip planned, the
// courier's round, the proof, what she cashes.

const code = (work: () => void): string | null => {
  try {
    work();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'thrown';
  }
};

describe('a trip, pure rules', () => {
  it('a delivery needs an address and a deposit that can still leave', () => {
    const ready = { status: 'ready', invoiced: false };
    expect(code(() => checkPlan({ kind: 'deliver', address: 'Agoè, près du marché', order: ready, fee: 500 }))).toBeNull();
    expect(code(() => checkPlan({ kind: 'deliver', address: ' ', order: ready, fee: 500 }))).toBe('address_needed');
    expect(code(() => checkPlan({ kind: 'deliver', address: 'x', order: null, fee: 0 }))).toBe('not_found');
    expect(code(() => checkPlan({ kind: 'deliver', address: 'x', order: { ...ready, status: 'collected' }, fee: 0 }))).toBe('order_not_open');
    expect(code(() => checkPlan({ kind: 'deliver', address: 'x', order: { ...ready, status: 'cancelled' }, fee: 0 }))).toBe('order_cancelled');
    // An invoice is written once: no fee is added behind it — a free delivery still may be.
    expect(code(() => checkPlan({ kind: 'deliver', address: 'x', order: { ...ready, invoiced: true }, fee: 500 }))).toBe('already_invoiced');
    expect(code(() => checkPlan({ kind: 'deliver', address: 'x', order: { ...ready, invoiced: true }, fee: 0 }))).toBeNull();
    expect(code(() => checkPlan({ kind: 'collect', address: 'x', order: null, fee: 0 }))).toBeNull();
  });

  it('a trip leaves once, ends once, and its proof names who received it', () => {
    expect(code(() => checkStart('planned'))).toBeNull();
    expect(code(() => checkStart('out'))).toBe('delivery_not_planned');
    expect(code(() => checkClose('out'))).toBeNull();
    expect(code(() => checkClose('planned'))).toBeNull();
    for (const over of ['done', 'failed', 'cancelled'] as const) expect(code(() => checkClose(over))).toBe('delivery_closed');
    expect(code(() => checkProof('  '))).toBe('recipient_needed');
    expect(code(() => checkProof('Mme Adjovi'))).toBeNull();
  });

  it('a round reads: what is on its way first, then zone by zone', () => {
    const at = (minute: number) => new Date(Date.UTC(2026, 9, 10, 8, minute));
    const trips = [
      { id: 'a', status: 'planned' as const, zoneName: 'Bè', createdAt: at(1) },
      { id: 'b', status: 'planned' as const, zoneName: 'Agoè', createdAt: at(3) },
      { id: 'c', status: 'out' as const, zoneName: 'Tokoin', createdAt: at(4) },
      { id: 'd', status: 'planned' as const, zoneName: 'Agoè', createdAt: at(2) },
    ];
    expect(roundOf(trips).map((trip) => trip.id)).toEqual(['c', 'd', 'b', 'a']);
  });
});

describe('collecting and delivering', () => {
  let db: TestSchema;
  let site: Site;
  let read: Catalog;
  let agoe = '';
  let be = '';
  let adjovi = '';
  const afi = person('usr_afi', 'owner');
  const mawuli = person('usr_mawuli', 'member'); // counter
  const kodjo = person('usr_kodjo', 'member'); // courier
  const orders: Record<string, string> = {};
  const trips: Record<string, string> = {};
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? null;
  const sql = (text: string, values: unknown[] = []) => transaction('org_acme', (client) => client.query(text, values));
  const receive = async (key: string, phone = '90 12 34 56', name = 'Mme Adjovi') => {
    const { orderId } = await done<{ orderId: string }>(afi, 'orders_receive', {
      siteId: site.siteId,
      phone,
      customerName: name,
      lines: [{ serviceId: service('Lavage et repassage'), articleId: article('Chemise'), quantity: 4 }],
    });
    orders[key] = orderId;
    // Ready without going through the workshop: what these tests are not about.
    await sql(`update orders set status = 'ready', ready_at = now() where order_id = $1`, [orderId]);
  };
  const order = (key: string) => done<Order>(afi, 'orders_get', { orderId: orders[key] });
  const trip = (key: string) => done<Delivery>(afi, 'delivery_get', { deliveryId: trips[key] });
  const plan = async (key: string, zoneId = agoe, who = mawuli) => {
    const planned = await done<{ deliveryId: string; fee: number }>(who, 'delivery_plan', {
      kind: 'deliver',
      orderId: orders[key],
      zoneId,
      address: 'Agoè, derrière le marché',
    });
    trips[key] = planned.deliveryId;
    return planned;
  };

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
    await hire(afi, 'owner');
    await hire(mawuli, 'counter');
    await hire(kodjo, 'courier');
    for (const key of ['d1', 'd2', 'd3', 'd4']) await receive(key);
    adjovi = (await order('d1')).customerId;
  }, 300_000);

  afterAll(async () => {
    await db.drop();
  });

  it('the zones and their fees are the laundry’s own', async () => {
    expect(await act(kodjo, 'delivery_set_zone', { name: 'Agoè', fee: 500 })).toEqual({ ok: false, code: 'not_allowed' });
    const prepared = await asPerson(afi, () =>
      registry.invoke({ ...agentFor(afi), name: 'delivery_set_zone', input: { name: 'Agoè', fee: 500 } }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    agoe = (await done<{ zoneId: string }>(afi, 'delivery_set_zone', { name: 'Agoè', fee: 500 })).zoneId;
    be = (await done<{ zoneId: string }>(afi, 'delivery_set_zone', { name: 'Bè', fee: 0 })).zoneId;
    expect(await act(afi, 'delivery_set_zone', { name: 'agoè', fee: 700 })).toEqual({ ok: false, code: 'zone_name_taken' });
    await done(afi, 'delivery_set_zone', { zoneId: agoe, name: 'Agoè', fee: 500 });
    expect(await act(afi, 'delivery_set_zone', { zoneId: 'zon_unknown', name: 'Ailleurs', fee: 0 })).toEqual({
      ok: false,
      code: 'not_found',
    });
    const board = await done<DeliveryBoard>(kodjo, 'delivery_board', {});
    expect(board.zones.map((zone) => [zone.name, zone.fee])).toEqual([
      ['Agoè', 500],
      ['Bè', 0],
    ]);
    expect(board).toMatchObject({ mayPlan: false, mayRun: true, trips: [], round: [] });
  }, 120_000);

  it('a delivery is planned for a deposit: its zone’s fee joins the deposit’s price', async () => {
    expect(await act(kodjo, 'delivery_plan', { kind: 'deliver', orderId: orders.d1, zoneId: agoe, address: 'x' })).toEqual({
      ok: false,
      code: 'not_allowed',
    });
    expect(await plan('d1')).toMatchObject({ fee: 500, zone: 'Agoè' });
    expect(await order('d1')).toMatchObject({ total: 2_500, deliveryAmount: 500 });
    expect((await order('d1')).events.map((event) => event.kind)).toContain('delivery_fee');
    // One trip under way per deposit.
    expect(await act(mawuli, 'delivery_plan', { kind: 'deliver', orderId: orders.d1, zoneId: be, address: 'x' })).toEqual({
      ok: false,
      code: 'delivery_already_planned',
    });
    expect(await act(mawuli, 'delivery_plan', { kind: 'deliver', orderId: orders.d2, zoneId: 'zon_unknown', address: 'x' })).toEqual({
      ok: false,
      code: 'not_found',
    });
    // The courier finds it on her round; nobody took it yet.
    const board = await done<DeliveryBoard>(kodjo, 'delivery_board', {});
    expect(board.round).toHaveLength(1);
    expect(board.round[0]).toMatchObject({
      kind: 'deliver',
      customerName: 'Mme Adjovi',
      zoneName: 'Agoè',
      fee: 500,
      balance: 2_500,
      status: 'planned',
      courierId: null,
    });
    // An agent prepares a trip; it plans none.
    const prepared = await asPerson(mawuli, () =>
      registry.invoke({
        ...agentFor(mawuli),
        name: 'delivery_plan',
        input: { kind: 'deliver', orderId: orders.d2, zoneId: be, address: 'x' },
      }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
  }, 120_000);

  it('the courier leaves, hands over with a proof, and cashes what is owed', async () => {
    const deliveryId = trips.d1;
    expect(await act(mawuli, 'delivery_start', { deliveryId })).toEqual({ ok: false, code: 'not_allowed' });
    expect(await done(kodjo, 'delivery_start', { deliveryId })).toMatchObject({ deliveryId });
    expect(await act(kodjo, 'delivery_start', { deliveryId })).toEqual({ ok: false, code: 'delivery_not_planned' });
    // The trip is hers: nobody else closes it.
    expect(await act(afi, 'delivery_complete', { deliveryId, recipient: 'Mme Adjovi' })).toEqual({
      ok: false,
      code: 'delivery_not_yours',
    });
    // The balance is cashed before the laundry leaves her hands.
    expect(await act(kodjo, 'delivery_complete', { deliveryId, recipient: 'Mme Adjovi' })).toEqual({
      ok: false,
      code: 'balance_due',
    });
    expect(await trip('d1')).toMatchObject({ status: 'out' });
    // Cash goes into her own till: without one, the message says so.
    const cash = { deliveryId, recipient: 'Mme Adjovi', payment: { amount: 2_500, method: 'cash' } };
    expect(await act(kodjo, 'delivery_complete', cash)).toEqual({ ok: false, code: 'cash_session_needed' });
    await done(kodjo, 'cash_open', { siteId: site.siteId, openingFloat: 0 });
    expect(await done(kodjo, 'delivery_complete', { ...cash, note: 'Remis à son gardien' })).toMatchObject({
      number: expect.any(String),
      cashed: 2_500,
    });
    expect(await order('d1')).toMatchObject({ status: 'collected', paid: 2_500 });
    expect(await trip('d1')).toMatchObject({
      status: 'done',
      recipient: 'Mme Adjovi',
      proofNote: 'Remis à son gardien',
      cashed: 2_500,
      courierId: kodjo.userId,
    });
    const [till] = await done<CashSession[]>(kodjo, 'cash_sessions', {});
    expect(till).toMatchObject({ cashIn: 2_500, expected: 2_500 });
    expect(await act(kodjo, 'delivery_complete', cash)).toEqual({ ok: false, code: 'delivery_closed' });
    // An agent never hands anything over.
    await plan('d3', be);
    const prepared = await asPerson(kodjo, () =>
      registry.invoke({ ...agentFor(kodjo), name: 'delivery_complete', input: { deliveryId: trips.d3, recipient: 'x' } }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect(await trip('d3')).toMatchObject({ status: 'planned', fee: 0 });
  }, 180_000);

  it('a trip that could not be done keeps its reason; one nobody left for is cancelled with its fee', async () => {
    await plan('d2');
    // Given to someone: she alone leaves with it.
    await done(mawuli, 'delivery_assign', { deliveryId: trips.d2, courierId: kodjo.userId });
    expect(await act(afi, 'delivery_start', { deliveryId: trips.d2 })).toEqual({ ok: false, code: 'delivery_not_yours' });
    await done(kodjo, 'delivery_start', { deliveryId: trips.d2 });
    expect(await act(mawuli, 'delivery_cancel', { deliveryId: trips.d2 })).toEqual({ ok: false, code: 'delivery_not_planned' });
    await done(kodjo, 'delivery_fail', { deliveryId: trips.d2, reason: 'Personne à la maison' });
    expect(await trip('d2')).toMatchObject({ status: 'failed', failure: 'Personne à la maison' });
    // The trip was made: its fee stays; the deposit is still at the laundry.
    expect(await order('d2')).toMatchObject({ status: 'ready', total: 2_500, deliveryAmount: 500 });
    await plan('d4');
    expect(await order('d4')).toMatchObject({ total: 2_500 });
    expect(await done(mawuli, 'delivery_cancel', { deliveryId: trips.d4 })).toMatchObject({ fee: 500 });
    expect(await order('d4')).toMatchObject({ total: 2_000, deliveryAmount: 0 });
    expect(await trip('d4')).toMatchObject({ status: 'cancelled' });
    // A deposit that is not ready does not leave.
    await sql(`update orders set status = 'in_progress' where order_id = $1`, [orders.d4]);
    await plan('d4', be);
    expect(await act(kodjo, 'delivery_start', { deliveryId: trips.d4 })).toEqual({ ok: false, code: 'order_not_ready' });
  }, 180_000);

  it('a collection fetches laundry at a customer’s: no fee, no money, a proof', async () => {
    const { deliveryId, fee } = await done<{ deliveryId: string; fee: number }>(mawuli, 'delivery_plan', {
      kind: 'collect',
      customerId: adjovi,
      zoneId: agoe,
      address: 'Agoè, villa bleue',
      note: 'Sonner deux fois',
    });
    expect(fee).toBe(0);
    await done(kodjo, 'delivery_start', { deliveryId });
    expect(
      await act(kodjo, 'delivery_complete', { deliveryId, recipient: 'Sa fille', payment: { amount: 100, method: 'mobile_money' } }),
    ).toEqual({ ok: false, code: 'invalid_input' });
    expect(await done(kodjo, 'delivery_complete', { deliveryId, recipient: 'Sa fille' })).toMatchObject({ kind: 'collect', cashed: 0 });
    expect(await done<Delivery>(afi, 'delivery_get', { deliveryId })).toMatchObject({
      status: 'done',
      kind: 'collect',
      orderId: null,
      recipient: 'Sa fille',
      note: 'Sonner deux fois',
    });
    expect(await act(mawuli, 'delivery_plan', { kind: 'collect', customerId: 'cus_unknown', zoneId: agoe, address: 'x' })).toEqual({
      ok: false,
      code: 'not_found',
    });
  }, 120_000);

  it('a company invoiced by the month receives its laundry unpaid; the fee is a line of its invoice', async () => {
    await receive('h1', '91 00 00 01', 'Hôtel Sarakawa');
    const hotel = (await order('h1')).customerId;
    await done(afi, 'accounts_set_terms', { customerId: hotel, legalName: 'Hôtel Sarakawa SA', monthlyInvoice: true });
    await plan('h1');
    await done(kodjo, 'delivery_start', { deliveryId: trips.h1 });
    expect(await done(kodjo, 'delivery_complete', { deliveryId: trips.h1, recipient: 'La réception' })).toMatchObject({ cashed: 0 });
    expect(await order('h1')).toMatchObject({ status: 'collected', paid: 0, total: 2_500 });
    const issued = await done<{ invoiceId: string; total: number }>(afi, 'invoices_issue', { orderIds: [orders.h1] });
    const { invoice } = await done<{ invoice: Invoice }>(afi, 'invoices_get', { invoiceId: issued.invoiceId });
    expect(invoice.lines.map((line) => [line.kind, line.amount])).toEqual([
      ['item', 2_000],
      ['delivery', 500],
    ]);
    expect(invoice.lines.reduce((sum, line) => sum + line.amount, 0)).toBe(invoice.total);
    // The failed trip's deposit is invoiced with its fee; no new fee is added behind the invoice.
    await done(afi, 'invoices_issue', { orderIds: [orders.d2] });
    expect(await act(mawuli, 'delivery_plan', { kind: 'deliver', orderId: orders.d2, zoneId: agoe, address: 'x' })).toEqual({
      ok: false,
      code: 'already_invoiced',
    });
    expect(await plan('d2', be)).toMatchObject({ fee: 0 });
  }, 180_000);

  it('one laundry’s zones and trips are never another’s', async () => {
    const rows: [string, (organizationId: string) => string][] = [
      ['delivery_zones', (o) => `(zone_id, organization_id, name) values ('zon_${o}', '${o}', 'Zone ${o}')`],
      [
        'deliveries',
        (o) =>
          `(delivery_id, organization_id, kind, customer_id, zone_id, zone_name, address, planned_on, created_by) values ('dlv_${o}', '${o}', 'collect', '${adjovi}', '${agoe}', 'x', 'x', current_date, 'usr_x')`,
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
  }, 180_000);
});
