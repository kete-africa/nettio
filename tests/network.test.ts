import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { NetworkResult, TransfersBoard } from '../src/features/network';
import {
  allocate,
  checkTransfer,
  commissionOf,
  nextStop,
  placeOf,
  receptionOf,
  siteResults,
  transferNumber,
  type Place,
} from '../src/features/network/domain/network';
import type { Transfer } from '../src/features/network/infrastructure/network.tables';
import type { Order } from '../src/features/orders';
import { transaction } from '../src/platform/db';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// Several sites (specs/028-sites): deposits that travel with a slip, shared costs spread over the
// sites, what each site earns, a partner's commission.

const code = (work: () => void): string | null => {
  try {
    work();
    return null;
  } catch (error) {
    return (error as { code?: string }).code ?? 'thrown';
  }
};
const at = (siteId: string): Place => ({ where: 'site', siteId });

describe('several sites, pure rules', () => {
  it('spreads an amount to the franc: the parts always add up', () => {
    const parts = allocate(1_001, [
      { siteId: 'a', weight: 2_000 },
      { siteId: 'b', weight: 6_000 },
      { siteId: 'c', weight: 0 },
    ]);
    expect([...parts]).toEqual([
      ['b', 751],
      ['a', 250],
      ['c', 0],
    ]);
    // No weight at all: in equal parts, the francs left to the first ones.
    const equal = allocate(1_000, [
      { siteId: 'a', weight: 0 },
      { siteId: 'b', weight: 0 },
      { siteId: 'c', weight: 0 },
    ]);
    expect([...equal.values()].sort()).toEqual([333, 333, 334]);
    expect([...equal.values()].reduce((sum, part) => sum + part, 0)).toBe(1_000);
    expect(allocate(500, []).size).toBe(0);
    expect([...allocate(0, [{ siteId: 'a', weight: 1 }])]).toEqual([['a', 0]]);
  });

  it('a site earns what it cashed, minus its charges, minus its part of the shared ones', () => {
    const sites = [
      { siteId: 'a', name: 'Agoè', orders: 1, pieces: 4, sales: 2_000, cashed: 2_000, charges: 0 },
      { siteId: 'b', name: 'Bè', orders: 3, pieces: 12, sales: 6_000, cashed: 1_000, charges: 300 },
    ];
    const results = siteResults({ sites, sharedCharges: 1_000, key: 'sales', partners: new Map([['b', 10]]) });
    expect(results.map((site) => [site.name, site.shared, site.result, site.commission])).toEqual([
      ['Agoè', 250, 1_750, null],
      ['Bè', 750, -50, 600],
    ]);
    // Whatever the key, the results add up to: cashed − every charge.
    for (const key of ['sales', 'pieces', 'equal'] as const) {
      const sum = siteResults({ sites, sharedCharges: 1_001, key, partners: new Map() }).reduce((total, site) => total + site.result, 0);
      expect(sum).toBe(3_000 - 300 - 1_001);
    }
    expect(commissionOf(2_150, 7.5)).toBe(161);
  });

  it('a deposit is at its counter until a slip carries it elsewhere', () => {
    expect(placeOf('bè', null)).toEqual(at('bè'));
    expect(placeOf('bè', { transferId: 't1', toSiteId: 'centre', status: 'sent', received: false })).toEqual({
      where: 'transit',
      toSiteId: 'centre',
      transferId: 't1',
    });
    expect(placeOf('bè', { transferId: 't1', toSiteId: 'centre', status: 'received', received: true })).toEqual(at('centre'));
    expect(placeOf('bè', { transferId: 't1', toSiteId: 'centre', status: 'received', received: false })).toEqual({
      where: 'missing',
      transferId: 't1',
    });
    expect(transferNumber(42)).toBe('T-0042');
  });

  it('it goes to its plant while it is worked on, and home once ready', () => {
    const order = { homeSiteId: 'bè', plantSiteId: 'centre' };
    expect(nextStop({ ...order, status: 'received', place: at('bè') })).toBe('centre');
    expect(nextStop({ ...order, status: 'in_progress', place: at('centre') })).toBeNull();
    expect(nextStop({ ...order, status: 'ready', place: at('centre') })).toBe('bè');
    expect(nextStop({ ...order, status: 'ready', place: at('bè') })).toBeNull();
    // A counter that processes by itself sends nothing anywhere.
    expect(nextStop({ homeSiteId: 'agoè', plantSiteId: null, status: 'received', place: at('agoè') })).toBeNull();
    expect(nextStop({ ...order, status: 'received', place: { where: 'transit', toSiteId: 'centre', transferId: 't1' } })).toBeNull();
  });

  it('what leaves together is all at the site it leaves from; a slip is checked on arrival', () => {
    const here = { status: 'received', place: at('bè') };
    expect(code(() => checkTransfer({ fromSiteId: 'bè', toSiteId: 'centre', orders: [here] }))).toBeNull();
    expect(code(() => checkTransfer({ fromSiteId: 'bè', toSiteId: 'bè', orders: [here] }))).toBe('transfer_same_site');
    expect(code(() => checkTransfer({ fromSiteId: 'bè', toSiteId: 'centre', orders: [] }))).toBe('transfer_empty');
    expect(code(() => checkTransfer({ fromSiteId: 'agoè', toSiteId: 'centre', orders: [here] }))).toBe('transfer_not_here');
    expect(code(() => checkTransfer({ fromSiteId: 'bè', toSiteId: 'centre', orders: [{ ...here, status: 'collected' }] }))).toBe(
      'order_not_open',
    );
    expect(receptionOf(['o1', 'o2', 'o3'], ['o3', 'o1'])).toEqual({ received: ['o3', 'o1'], missing: ['o2'] });
    expect(code(() => receptionOf(['o1'], ['o9']))).toBe('transfer_unknown_deposit');
  });
});

describe('a laundry with a plant, a counter and a partner', () => {
  let db: TestSchema;
  let read: Catalog;
  let agoe: Site;
  let centre: Site;
  let be: Site;
  let transferId = '';
  const afi = person('usr_afi', 'owner');
  const mawuli = person('usr_mawuli', 'member'); // counter
  const yao = person('usr_yao', 'member'); // workshop
  const essi = person('usr_essi', 'member'); // cashier
  const orders: Record<string, string> = {};
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const sql = (text: string, values: unknown[] = []) => transaction('org_acme', (client) => client.query(text, values));
  const service = (name: string) => read.services.find((s) => s.name === name)?.serviceId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? null;
  const receive = async (key: string, site: Site) => {
    const { orderId } = await done<{ orderId: string }>(afi, 'orders_receive', {
      siteId: site.siteId,
      phone: '90 12 34 56',
      customerName: 'Mme Adjovi',
      lines: [{ serviceId: service('Lavage et repassage'), articleId: article('Chemise'), quantity: 4 }],
    });
    orders[key] = orderId;
  };
  const board = () => done<TransfersBoard>(afi, 'transfers_board', {});
  const result = () => done<NetworkResult>(afi, 'sites_result', { month });
  const sites = async () => (await done<{ sites: Site[] }>(afi, 'business_overview', {})).sites;

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'starting',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    await done(afi, 'business_save_site', { name: 'Centre', code: 'C', kind: 'plant' });
    centre = (await sites()).find((site) => site.name === 'Centre') as Site;
    await done(afi, 'business_save_site', { name: 'Bè', code: 'B', kind: 'counter', plantSiteId: centre.siteId });
    const all = await sites();
    agoe = all.find((site) => site.name === 'Agoè') as Site;
    be = all.find((site) => site.name === 'Bè') as Site;
    read = await done<Catalog>(afi, 'catalog_read', {});
    await done(afi, 'catalog_set_price', { serviceId: service('Lavage et repassage'), articleId: article('Chemise'), amount: 500 });
    await hire(afi, 'owner');
    await hire(mawuli, 'counter');
    await hire(yao, 'workshop');
    await hire(essi, 'cashier');
    await receive('a1', agoe);
    for (const key of ['b1', 'b2', 'b3']) await receive(key, be);
  }, 300_000);

  afterAll(async () => {
    await db.drop();
  });

  it('what a counter received waits to go to its plant; a counter that processes sends nothing', async () => {
    const { toSend, transfers, missing, sites: listed } = await board();
    expect(listed).toHaveLength(3);
    expect(toSend).toHaveLength(1);
    expect(toSend[0]).toMatchObject({ fromSiteId: be.siteId, toSiteId: centre.siteId });
    expect(toSend[0]?.orders.map((order) => order.orderId).sort()).toEqual([orders.b1, orders.b2, orders.b3].sort());
    expect(transfers).toEqual([]);
    expect(missing).toEqual([]);
  }, 120_000);

  it('deposits leave with a numbered slip — only from where they are', async () => {
    const send = { fromSiteId: be.siteId, toSiteId: centre.siteId, orderIds: [orders.b1, orders.b2] };
    expect(await act(essi, 'transfers_send', send)).toEqual({ ok: false, code: 'not_allowed' });
    // An agent prepares a slip; nothing leaves.
    const prepared = await asPerson(mawuli, () => registry.invoke({ ...agentFor(mawuli), name: 'transfers_send', input: send }));
    expect(prepared).toMatchObject({ status: 'draft' });
    const sent = await done<{ transferId: string; number: string; deposits: number; to: string }>(mawuli, 'transfers_send', {
      ...send,
      note: 'Deux sacs bleus',
    });
    expect(sent).toMatchObject({ number: 'T-0001', deposits: 2, to: 'Centre' });
    transferId = sent.transferId;
    // On the road: it cannot leave again, nor from somewhere it is not.
    expect(await act(mawuli, 'transfers_send', send)).toEqual({ ok: false, code: 'transfer_not_here' });
    expect(await act(mawuli, 'transfers_send', { ...send, fromSiteId: agoe.siteId, orderIds: [orders.b3] })).toEqual({
      ok: false,
      code: 'transfer_not_here',
    });
    expect(await act(mawuli, 'transfers_send', { ...send, toSiteId: be.siteId, orderIds: [orders.b3] })).toEqual({
      ok: false,
      code: 'transfer_same_site',
    });
    expect(await act(mawuli, 'transfers_send', { ...send, orderIds: ['ord_unknown'] })).toEqual({ ok: false, code: 'not_found' });
    const now = await board();
    expect(now.toSend[0]?.orders.map((order) => order.orderId)).toEqual([orders.b3]);
    expect(now.transfers).toHaveLength(1);
    expect(now.transfers[0]).toMatchObject({ number: 'T-0001', status: 'sent', fromName: 'Bè', toName: 'Centre', note: 'Deux sacs bleus' });
    expect(now.transfers[0]?.lines.map((line) => [line.pieces, line.received])).toEqual([
      [4, false],
      [4, false],
    ]);
    const history = (await done<Order>(afi, 'orders_get', { orderId: orders.b1 })).events.map((event) => event.kind);
    expect(history).toContain('transfer_sent');
  }, 180_000);

  it('the slip is checked on arrival, once: what is not there is said missing', async () => {
    expect(await act(essi, 'transfers_receive', { transferId, receivedOrderIds: [] })).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(yao, 'transfers_receive', { transferId, receivedOrderIds: [orders.b3] })).toEqual({
      ok: false,
      code: 'transfer_unknown_deposit',
    });
    expect(await done(yao, 'transfers_receive', { transferId, receivedOrderIds: [orders.b1], note: 'Un sac seulement' })).toEqual({
      number: 'T-0001',
      received: 1,
      missing: 1,
    });
    expect(await act(yao, 'transfers_receive', { transferId, receivedOrderIds: [orders.b2] })).toEqual({
      ok: false,
      code: 'transfer_already_received',
    });
    const now = await board();
    expect(now.missing.map((order) => order.orderId)).toEqual([orders.b2]);
    const slip = await done<Transfer>(afi, 'transfers_get', { transferId });
    expect(slip).toMatchObject({ status: 'received', receptionNote: 'Un sac seulement' });
    expect(slip.lines.map((line) => line.received).sort()).toEqual([false, true]);
    // A missing deposit travels nowhere until it is found.
    expect(await act(mawuli, 'transfers_send', { fromSiteId: be.siteId, toSiteId: centre.siteId, orderIds: [orders.b2] })).toEqual({
      ok: false,
      code: 'transfer_not_here',
    });
    const history = (await done<Order>(afi, 'orders_get', { orderId: orders.b2 })).events.map((event) => event.kind);
    expect(history).toContain('transfer_missing');
  }, 180_000);

  it('once ready at the plant, a deposit waits to go home; received there, it waits for nobody', async () => {
    await sql(`update orders set status = 'ready', ready_at = now() where order_id = $1`, [orders.b1]);
    const back = (await board()).toSend.find((group) => group.fromSiteId === centre.siteId);
    expect(back).toMatchObject({ toSiteId: be.siteId });
    expect(back?.orders.map((order) => order.orderId)).toEqual([orders.b1]);
    const sent = await done<{ transferId: string; number: string }>(yao, 'transfers_send', {
      fromSiteId: centre.siteId,
      toSiteId: be.siteId,
      orderIds: [orders.b1],
    });
    expect(sent.number).toBe('T-0002');
    await done(mawuli, 'transfers_receive', { transferId: sent.transferId, receivedOrderIds: [orders.b1] });
    const now = await board();
    expect(now.toSend.flatMap((group) => group.orders.map((order) => order.orderId))).toEqual([orders.b3]);
    expect(now.transfers.map((transfer) => [transfer.number, transfer.status])).toEqual([
      ['T-0002', 'received'],
      ['T-0001', 'received'],
    ]);
  }, 180_000);

  it('each site’s result: what it cashed, its charges, its part of the shared ones — and they add up', async () => {
    await done(afi, 'payments_record', { orderId: orders.a1, amount: 2_000, method: 'mobile_money' });
    await done(afi, 'payments_record', { orderId: orders.b1, amount: 1_000, method: 'mobile_money' });
    const expense = { spentOn: today, category: 'electricity', behavior: 'variable', paidFrom: 'mobile_money' };
    await done(afi, 'expenses_record', { ...expense, label: 'Électricité de Bè', amount: 300, siteId: be.siteId });
    await done(afi, 'expenses_record', { ...expense, label: 'Abonnement Internet', amount: 1_001 });
    const first = await result();
    expect(first.allocation).toBe('sales');
    expect(first.sharedCharges).toBe(1_001);
    expect(first.sites.map((site) => [site.name, site.orders, site.sales, site.cashed, site.charges, site.shared, site.result])).toEqual([
      ['Agoè', 1, 2_000, 2_000, 0, 250, 1_750],
      ['Centre', 0, 0, 0, 0, 0, 0],
      ['Bè', 3, 6_000, 1_000, 300, 751, -51],
    ]);
    expect(first.total).toEqual({ cashed: 3_000, charges: 1_301, result: 1_699 });
    expect(first.prepaid).toBe(0);
    // The owner chooses the key; the parts still add up.
    expect(await act(mawuli, 'sites_set_allocation', { allocation: 'equal' })).toEqual({ ok: false, code: 'not_allowed' });
    await done(afi, 'sites_set_allocation', { allocation: 'equal' });
    const equal = await result();
    expect(equal.sites.map((site) => site.shared).sort()).toEqual([333, 334, 334]);
    expect(equal.sites.reduce((sum, site) => sum + site.result, 0)).toBe(1_699);
    // Credit paid ahead belongs to no site: said apart, and the whole still adds up.
    const { customerId } = await done<Order>(afi, 'orders_get', { orderId: orders.a1 });
    await done(afi, 'credit_top_up', { customerId, cashed: 5_000, method: 'mobile_money' });
    await done(afi, 'payments_record', { orderId: orders.b3, amount: 500, method: 'credit' });
    const after = await result();
    expect(after.prepaid).toBe(4_500);
    expect(after.total.cashed).toBe(8_000);
    expect(after.sites.reduce((sum, site) => sum + site.result, 0) + after.prepaid).toBe(after.total.result);
  }, 180_000);

  it('a partner’s point earns a commission on what it received: said, the laundry’s to pay', async () => {
    const partner = { siteId: be.siteId, partnerName: 'Boutique Chez Ama', phone: '90 00 00 09', commissionPercent: 10 };
    expect(await act(mawuli, 'sites_set_partner', partner)).toEqual({ ok: false, code: 'not_allowed' });
    const prepared = await asPerson(afi, () => registry.invoke({ ...agentFor(afi), name: 'sites_set_partner', input: partner }));
    expect(prepared).toMatchObject({ status: 'draft' });
    // A partner receives laundry: a plant is no partner's point.
    expect(await act(afi, 'sites_set_partner', { ...partner, siteId: centre.siteId })).toEqual({
      ok: false,
      code: 'site_does_not_receive',
    });
    await done(afi, 'sites_set_partner', partner);
    const view = await result();
    expect(view.partners).toEqual([{ siteId: be.siteId, partnerName: 'Boutique Chez Ama', phone: '90 00 00 09', commissionPercent: 10 }]);
    expect(view.sites.map((site) => [site.name, site.commission])).toEqual([
      ['Agoè', null],
      ['Centre', null],
      ['Bè', 600],
    ]);
    // Said, not deducted: the result does not move until the laundry records what it paid.
    expect(view.sites.reduce((sum, site) => sum + site.result, 0) + view.prepaid).toBe(view.total.result);
    await done(afi, 'sites_unset_partner', { siteId: be.siteId });
    expect(await act(afi, 'sites_unset_partner', { siteId: be.siteId })).toEqual({ ok: false, code: 'not_found' });
    expect((await result()).sites.every((site) => site.commission === null)).toBe(true);
  }, 180_000);

  it('one laundry’s slips, partners and rules are never another’s', async () => {
    const rows: [string, (organizationId: string) => string][] = [
      ['transfer_counters', (o) => `(organization_id, next_seq) values ('${o}', 2)`],
      [
        'transfers',
        (o) =>
          `(transfer_id, organization_id, number, from_site_id, to_site_id, sent_by) values ('trf_${o}', '${o}', 'T-1', '${be.siteId}', '${centre.siteId}', 'usr_x')`,
      ],
      [
        'transfer_orders',
        (o) =>
          `(organization_id, transfer_id, order_id) values ('${o}', '${transferId}', '${o === 'org_x' ? orders.a1 : orders.b3}')`,
      ],
      ['partner_points', (o) => `(organization_id, site_id, partner_name) values ('${o}', '${be.siteId}', 'x')`],
      ['network_rules', (o) => `(organization_id) values ('${o}')`],
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
  }, 240_000);
});
