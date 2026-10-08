import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Settings, Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { Order } from '../src/features/orders';
import type { Incident, WorkshopQueue, WorkUnit } from '../src/features/workshop';
import { advance, currentStep, isFinished, openUnits, sendBack, type WorkLine } from '../src/features/workshop/domain/work';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// The workshop's proof (specs/005-workshop): a deposit opens its units where it is processed, each
// follows the route of its service one touch at a time, and the deposit is ready when — and only
// when — all of them are done.

const route = [
  { stepId: 'stp_wash', name: 'Lavage' },
  { stepId: 'stp_iron', name: 'Repassage' },
];
const washLine = (over: Partial<WorkLine>): WorkLine => ({
  serviceId: 'svc_wash',
  serviceName: 'Lavage et repassage',
  route,
  articleName: 'Chemise',
  pricing: 'per_piece',
  quantity: 3,
  ...over,
});

describe('the rules of the workshop', () => {
  it('at the bag grain, one unit per service that goes through the workshop', () => {
    const units = openUnits(
      [
        washLine({}),
        washLine({ articleName: 'Pantalon', quantity: 2 }),
        washLine({ serviceId: 'svc_kilo', serviceName: 'Linge au kilo', articleName: null, pricing: 'per_kg', quantity: 4.5, route: [route[0] as (typeof route)[number]] }),
        washLine({ serviceId: 'svc_alter', serviceName: 'Retouche', route: [] }),
      ],
      'bag',
    );
    expect(units.map((u) => [u.label, u.quantity, u.route.length])).toEqual([
      ['Lavage et repassage', 5, 2],
      ['Linge au kilo', 4.5, 1],
    ]);
  });

  it('at the piece grain, one unit per piece; a line by the kilo is one unit', () => {
    const units = openUnits(
      [washLine({}), washLine({ serviceId: 'svc_kilo', serviceName: 'Linge au kilo', articleName: null, pricing: 'per_kg', quantity: 4.5 })],
      'piece',
    );
    expect(units.map((u) => u.label)).toEqual([
      'Chemise 1/3 · Lavage et repassage',
      'Chemise 2/3 · Lavage et repassage',
      'Chemise 3/3 · Lavage et repassage',
      'Linge au kilo',
    ]);
    expect(units.every((u) => u.quantity === 1 || u.label === 'Linge au kilo')).toBe(true);
  });

  it('a unit moves along its route one step at a time, then is finished', () => {
    const start = { route, position: 0 };
    expect(currentStep(start)?.name).toBe('Lavage');
    const first = advance(start);
    expect(first).toMatchObject({ position: 1, done: { name: 'Lavage' }, finished: false });
    const second = advance({ route, position: first.position });
    expect(second).toMatchObject({ position: 2, done: { name: 'Repassage' }, finished: true });
    expect(isFinished({ route, position: 2 })).toBe(true);
    expect(() => advance({ route, position: 2 })).toThrow(/unit_finished/);
  });

  it('a rework sends a unit back to an earlier step of its own route', () => {
    expect(sendBack({ route, position: 2 }, 'stp_wash')).toBe(0);
    expect(sendBack({ route, position: 2 }, 'stp_iron')).toBe(1);
    expect(() => sendBack({ route, position: 1 }, 'stp_iron')).toThrow(/step_not_before/);
    expect(() => sendBack({ route, position: 1 }, 'stp_other')).toThrow(/step_not_on_route/);
  });
});

describe('in the workshop', () => {
  let db: TestSchema;
  let counter: Site;
  let plant: Site;
  let read: Catalog;
  const afi = person('usr_afi', 'owner');
  const yao = person('usr_yao', 'member'); // workshop
  const essi = person('usr_essi', 'member'); // cashier
  const service = (name: string) => read.services.find((s) => s.name === name);
  const step = (name: string) => read.steps.find((s) => s.name === name)?.stepId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? '';
  const queue = (who = yao) => done<WorkshopQueue>(who, 'workshop_queue', {});
  const work = (orderId: string) =>
    done<{ units: WorkUnit[]; incidents: Incident[] }>(afi, 'workshop_order', { orderId });
  const order = (orderId: string) => done<Order>(afi, 'orders_get', { orderId });
  const receive = (lines: unknown[], phone = '90 12 34 56') =>
    done<{ orderId: string; number: string }>(afi, 'orders_receive', {
      siteId: counter.siteId,
      phone,
      customerName: 'Mme Adjovi',
      lines,
    });
  const shirts = (quantity: number) => ({
    serviceId: service('Lavage et repassage')?.serviceId,
    articleId: article('Chemise'),
    quantity,
  });
  const advanceOne = (unitId: string, who = yao) =>
    done<{ done: string; next: string | null; orderReady: boolean }>(who, 'workshop_advance', { unitId });

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'multi_site',
      staffing: 'solo',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    const { sites } = await done<{ sites: Site[] }>(afi, 'business_overview', {});
    counter = sites.find((s) => s.kind === 'counter') as Site;
    plant = sites.find((s) => s.kind === 'plant') as Site;
    read = await done<Catalog>(afi, 'catalog_read', {});
    // Short routes, to read the tests: wash and iron in two steps, laundry by the kilo in one.
    await done(afi, 'catalog_save_service', {
      ...service('Lavage et repassage'),
      stepIds: [step('Lavage'), step('Repassage')],
    });
    await done(afi, 'catalog_save_service', { ...service('Linge au kilo'), stepIds: [step('Lavage')] });
    await done(afi, 'catalog_save_service', { ...service('Repassage seul'), stepIds: [] });
    for (const name of ['Lavage et repassage', 'Repassage seul']) {
      await done(afi, 'catalog_set_price', {
        serviceId: service(name)?.serviceId,
        articleId: article('Chemise'),
        amount: 500,
      });
    }
    await done(afi, 'catalog_set_price', {
      serviceId: service('Linge au kilo')?.serviceId,
      articleId: null,
      amount: 600,
    });
    read = await done<Catalog>(afi, 'catalog_read', {});
    await hire(yao, 'workshop');
    await hire(essi, 'cashier');
  }, 180_000);

  afterAll(async () => {
    await db.drop();
  });

  let first: { orderId: string; number: string };

  it('a deposit opens one unit per service, at the plant its counter sends to', async () => {
    first = await receive([
      shirts(3),
      { serviceId: service('Linge au kilo')?.serviceId, articleId: null, quantity: 4.5 },
    ]);
    const { units } = await work(first.orderId);
    expect(units.map((u) => [u.label, u.quantity, u.siteId, u.position])).toEqual([
      ['Lavage et repassage', 3, plant.siteId, 0],
      ['Linge au kilo', 4.5, plant.siteId, 0],
    ]);
    expect(units[0]?.route.map((s) => s.name)).toEqual(['Lavage', 'Repassage']);
  });

  it('shows what waits step by step, the soonest promised first', async () => {
    const waiting = await queue();
    expect(waiting.steps.map((s) => [s.name, s.units.length])).toEqual([['Lavage', 2]]);
    expect(waiting).toMatchObject({ waiting: 2, late: 0 });
    expect(waiting.steps[0]?.units[0]).toMatchObject({ number: first.number, express: false });
    // The queue of another site is empty.
    expect((await done<WorkshopQueue>(yao, 'workshop_queue', { siteId: counter.siteId })).waiting).toBe(0);
  });

  it('one touch validates a step: signed, and the deposit is in progress', async () => {
    const { units } = await work(first.orderId);
    const moved = await advanceOne(units[0]?.unitId ?? '');
    expect(moved).toEqual(expect.objectContaining({ done: 'Lavage', next: 'Repassage', orderReady: false }));
    const full = await order(first.orderId);
    expect(full.status).toBe('in_progress');
    expect(full.events.at(-1)).toMatchObject({ kind: 'in_progress', actorId: 'usr_yao' });
    expect((await queue()).steps.map((s) => [s.name, s.units.length])).toEqual([
      ['Lavage', 1],
      ['Repassage', 1],
    ]);
  });

  it('a deposit with work left cannot be marked ready by hand', async () => {
    expect(await act(afi, 'orders_mark_ready', { orderId: first.orderId })).toEqual({
      ok: false,
      code: 'workshop_not_finished',
    });
  });

  it('who does not work in the workshop validates nothing, and an agent only prepares', async () => {
    const { units } = await work(first.orderId);
    const unitId = units[0]?.unitId;
    expect(await act(essi, 'workshop_advance', { unitId })).toEqual({ ok: false, code: 'not_allowed' });
    const prepared = await asPerson(yao, () =>
      registry.invoke({ ...agentFor(yao), name: 'workshop_advance', input: { unitId } }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    expect((await work(first.orderId)).units[0]?.position).toBe(1);
  });

  it('a route changed after the deposit never touches its units', async () => {
    await done(afi, 'catalog_save_service', {
      ...service('Lavage et repassage'),
      stepIds: [step('Tri'), step('Lavage'), step('Repassage'), step('Contrôle')],
    });
    expect((await work(first.orderId)).units[0]?.route.map((s) => s.name)).toEqual([
      'Lavage',
      'Repassage',
    ]);
    await done(afi, 'catalog_save_service', {
      ...service('Lavage et repassage'),
      stepIds: [step('Lavage'), step('Repassage')],
    });
  });

  it('the deposit is ready when its last unit finishes — and the center hears it', async () => {
    const { units } = await work(first.orderId);
    expect((await advanceOne(units[0]?.unitId ?? '')).orderReady).toBe(false);
    const last = await advanceOne(units[1]?.unitId ?? '');
    expect(last).toEqual(expect.objectContaining({ done: 'Lavage', next: null, orderReady: true }));
    const full = await order(first.orderId);
    expect(full.status).toBe('ready');
    expect(full.events.map((e) => e.kind)).toEqual(['received', 'in_progress', 'ready']);
    expect((await queue()).waiting).toBe(0);
    const { rows } = await db.owner.query<{ envelope: { type: string; data: { orderId: string } } }>(
      `select envelope from ${db.schema}.kete_center_outbox order by created_at`,
    );
    expect(
      rows.filter((r) => r.envelope.type === 'order.ready' && r.envelope.data.orderId === first.orderId),
    ).toHaveLength(1);
    // A finished unit takes no more step.
    expect(await act(yao, 'workshop_advance', { unitId: units[0]?.unitId })).toEqual({
      ok: false,
      code: 'order_not_open',
    });
  });

  it('stores a ready deposit where its customer will find it', async () => {
    await done(yao, 'orders_store', { orderId: first.orderId, location: 'Portant B' });
    expect(await order(first.orderId)).toMatchObject({ location: 'Portant B', status: 'ready' });
  });

  it('an incident sends a unit back: a rework, counted apart; the deposit is in progress again', async () => {
    const { units } = await work(first.orderId);
    const unitId = units[0]?.unitId;
    expect(
      await act(yao, 'workshop_report_incident', { unitId, kind: 'stain_left', backToStepId: step('Tri') }),
    ).toEqual({ ok: false, code: 'step_not_on_route' });
    await done(yao, 'workshop_report_incident', {
      unitId,
      kind: 'stain_left',
      note: 'tache au col',
      backToStepId: step('Lavage'),
    });
    const after = await work(first.orderId);
    expect(after.units[0]).toMatchObject({ position: 0, rework: 1, finishedAt: null });
    expect(after.incidents).toMatchObject([{ kind: 'stain_left', note: 'tache au col', backToStep: 'Lavage', resolvedAt: null }]);
    expect((await order(first.orderId)).status).toBe('in_progress');
    expect((await queue()).steps.map((s) => [s.name, s.units[0]?.rework])).toEqual([['Lavage', 1]]);
  });

  it('an open incident is listed until someone says what was done', async () => {
    const open = await done<Incident[]>(yao, 'workshop_incidents', {});
    expect(open).toHaveLength(1);
    expect(await act(yao, 'workshop_resolve_incident', { incidentId: open[0]?.incidentId, resolution: '' })).toEqual({
      ok: false,
      code: 'invalid_input',
    });
    await done(yao, 'workshop_resolve_incident', {
      incidentId: open[0]?.incidentId,
      resolution: 'relavé, tache partie',
    });
    expect(await done<Incident[]>(yao, 'workshop_incidents', {})).toHaveLength(0);
    // The rework is done: the deposit is ready again.
    const { units } = await work(first.orderId);
    await advanceOne(units[0]?.unitId ?? '');
    expect((await advanceOne(units[0]?.unitId ?? '')).orderReady).toBe(true);
  });

  it('a service with no step opens no unit: one gesture marks the deposit ready', async () => {
    const direct = await receive([
      { serviceId: service('Repassage seul')?.serviceId, articleId: article('Chemise'), quantity: 2 },
    ]);
    expect((await work(direct.orderId)).units).toHaveLength(0);
    await done(yao, 'orders_mark_ready', { orderId: direct.orderId, location: 'Rayon 1' });
    expect((await order(direct.orderId)).status).toBe('ready');
  });

  it('at the piece grain, each piece moves alone; a cancelled deposit leaves the queue', async () => {
    const settings = (await done<{ settings: Settings }>(afi, 'business_overview', {})).settings;
    await done(afi, 'business_change_settings', { ...settings, tracking: 'piece' });
    const pieces = await receive([shirts(3)]);
    const { units } = await work(pieces.orderId);
    expect(units.map((u) => u.label)).toEqual([
      'Chemise 1/3 · Lavage et repassage',
      'Chemise 2/3 · Lavage et repassage',
      'Chemise 3/3 · Lavage et repassage',
    ]);
    await advanceOne(units[0]?.unitId ?? '');
    const waiting = await queue();
    expect(waiting.steps.map((s) => [s.name, s.units.length])).toEqual([
      ['Lavage', 2],
      ['Repassage', 1],
    ]);
    await done(afi, 'orders_cancel', { orderId: pieces.orderId, reason: 'client parti' });
    expect((await queue()).waiting).toBe(0);
  });

  it('keeps each organization’s units, steps and incidents to itself (RLS)', async () => {
    const base = (id: string, org: string, code: string) => [
      `insert into sites (site_id, organization_id, name, code, kind)
       values ('sit_${id}', '${org}', 'x', '${code}', 'counter_plant')`,
      `insert into customers (customer_id, organization_id, phone, name)
       values ('cus_${id}', '${org}', '+2289100000${code.charCodeAt(1) - 64}', 'x')`,
      `insert into orders (order_id, organization_id, site_id, number, customer_id, subtotal, total,
                           promised_at, created_by)
       values ('ord_${id}', '${org}', 'sit_${id}', '${id}', 'cus_${id}', 1, 1, now(), 'usr_x')`,
      `insert into work_units (unit_id, organization_id, order_id, site_id, service_id, label, quantity, route)
       values ('wku_${id}', '${org}', 'ord_${id}', 'sit_${id}', 'svc_x', 'x', 1, '[]')`,
    ];
    const chain: Record<string, (org: string) => string[]> = {
      work_units: (org) => base(`wu_${org}`, org, 'WA'),
      work_events: (org) => [
        ...base(`we_${org}`, org, 'WB'),
        `insert into work_events (event_id, organization_id, unit_id, order_id, kind, step_id, step_name,
                                  actor_id, actor_kind)
         values ('wev_${org}', '${org}', 'wku_we_${org}', 'ord_we_${org}', 'step', 'stp_x', 'x', 'usr_x', 'person')`,
      ],
      incidents: (org) => [
        ...base(`in_${org}`, org, 'WC'),
        `insert into incidents (incident_id, organization_id, unit_id, order_id, kind, created_by)
         values ('inc_${org}', '${org}', 'wku_in_${org}', 'ord_in_${org}', 'other', 'usr_x')`,
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
