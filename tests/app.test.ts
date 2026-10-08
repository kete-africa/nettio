import { readFileSync } from 'node:fs';
import { readJournal } from '@kete/commands';
import { validateManifest } from '@kete/sdk';
import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Settings, Site, StaffMember } from '../src/features/business';
import { businessFlow, type FlowWords } from '../src/features/business/domain/flow';
import { defaultPermissions, permissionsOfRole } from '../src/features/business/domain/roles';
import { checkSite } from '../src/features/business/domain/sites';
import type { Catalog } from '../src/features/catalog';
import { checkPack, checkPrice, checkRoute, packAdmits } from '../src/features/catalog/domain/catalog';
import { RuleError } from '../src/lib/rule-error';
import { transaction } from '../src/platform/db';
import { manifest } from '../src/platform/events';
import { businessPermissionList } from '../src/platform/permissions';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, connect, done, freshSchema, hire, onScreen, person } from './helpers';

// The foundation's proof (specs/001-foundation): the laundry sets itself up, its diagram is drawn
// from its settings, its catalogue obeys its rules, and every right is checked on every surface.

let db: TestSchema;

const afi = person('usr_afi', 'owner');
const kossi = person('usr_kossi', 'member');
const mawuli = person('usr_mawuli', 'member');

beforeAll(async () => {
  db = await freshSchema();
});

afterAll(async () => {
  await db.drop();
});

const overview = () =>
  done<{ settings: Settings | null; sites: Site[] }>(afi, 'business_overview', {});
const catalog = () => done<Catalog>(afi, 'catalog_read', {});

const site = (over: Partial<Site>): Site => ({
  siteId: 'sit_a',
  name: 'Agoè',
  code: 'A',
  kind: 'counter_plant',
  plantSiteId: null,
  active: true,
  ...over,
});

const words: FlowWords = {
  sites: 'Sites',
  routes: 'Routes',
  life: 'Life',
  sendsTo: 'sends to',
  direct: 'direct',
  siteKinds: { counter: 'counter', plant: 'plant', counter_plant: 'both' },
  pricings: { per_piece: 'piece', per_kg: 'kilo' },
  natures: { workshop: 'workshop', counter_only: 'counter', logistics: 'logistics' },
  states: {
    received: 'received',
    in_progress: 'in progress',
    ready: 'ready',
    collected: 'collected',
    cancelled: 'cancelled',
  },
};

describe('the rules of the sites', () => {
  it('keeps a code to one site, and a counter attached to a site that processes', () => {
    const plant = site({ siteId: 'sit_c', code: 'C', kind: 'plant' });
    const counter = site({ siteId: 'sit_b', code: 'B', kind: 'counter', plantSiteId: 'sit_c' });
    expect(() => checkSite(counter, [plant, site({})])).not.toThrow();
    expect(() => checkSite({ ...counter, code: 'C' }, [plant, site({})])).toThrow(RuleError);
    expect(() => checkSite({ ...counter, plantSiteId: 'sit_x' }, [plant])).toThrow(
      /site_plant_unknown/,
    );
    expect(() => checkSite({ ...plant, plantSiteId: 'sit_a' }, [site({})])).toThrow(
      /site_plant_not_needed/,
    );
  });

  it('keeps one site that receives, and a plant others send to', () => {
    const plant = site({ siteId: 'sit_c', code: 'C', kind: 'plant' });
    const counter = site({ siteId: 'sit_b', code: 'B', kind: 'counter', plantSiteId: 'sit_c' });
    expect(() => checkSite({ ...counter, active: false }, [plant, counter])).toThrow(
      /site_last_counter/,
    );
    expect(() => checkSite({ ...plant, active: false }, [plant, counter])).toThrow(
      /site_plant_in_use/,
    );
  });
});

describe('the rules of the catalogue', () => {
  const steps = [
    { stepId: 'stp_1', active: true },
    { stepId: 'stp_2', active: true },
    { stepId: 'stp_3', active: false },
  ];

  it('a route names known, active steps, each once, for a workshop service only', () => {
    expect(() => checkRoute({ nature: 'workshop', stepIds: ['stp_1', 'stp_2'] }, steps)).not.toThrow();
    expect(() => checkRoute({ nature: 'workshop', stepIds: [] }, steps)).not.toThrow();
    expect(() => checkRoute({ nature: 'workshop', stepIds: ['stp_3'] }, steps)).toThrow(
      /route_step_unknown/,
    );
    expect(() => checkRoute({ nature: 'workshop', stepIds: ['stp_1', 'stp_1'] }, steps)).toThrow(
      /route_step_twice/,
    );
    expect(() => checkRoute({ nature: 'logistics', stepIds: ['stp_1'] }, steps)).toThrow(
      /route_not_for_this_nature/,
    );
  });

  it('a per-piece service is priced per article, a per-kilo service for a kilo', () => {
    expect(() => checkPrice({ pricing: 'per_piece' }, { articleId: 'art_1' })).not.toThrow();
    expect(() => checkPrice({ pricing: 'per_kg' }, { articleId: null })).not.toThrow();
    expect(() => checkPrice({ pricing: 'per_piece' }, { articleId: null })).toThrow(RuleError);
    expect(() => checkPrice({ pricing: 'per_kg' }, { articleId: 'art_1' })).toThrow(RuleError);
  });

  it('a pack admits the services of its mode: those it names, or all of them', () => {
    const piece = { serviceId: 'svc_p', pricing: 'per_piece' as const };
    const kilo = { serviceId: 'svc_k', pricing: 'per_kg' as const };
    expect(packAdmits({ mode: 'pieces', serviceIds: [] }, piece)).toBe(true);
    expect(packAdmits({ mode: 'pieces', serviceIds: [] }, kilo)).toBe(false);
    expect(packAdmits({ mode: 'pieces', serviceIds: ['svc_other'] }, piece)).toBe(false);
    expect(() => checkPack({ mode: 'weight', serviceIds: ['svc_p'] }, [piece, kilo])).toThrow(
      /pack_service_wrong_mode/,
    );
  });
});

describe('the diagram is a pure function of the settings', () => {
  const steps = [
    { stepId: 'stp_1', name: 'Tri' },
    { stepId: 'stp_2', name: 'Lavage' },
    { stepId: 'stp_3', name: 'Repassage' },
  ];
  const service = (stepIds: string[]) => ({
    serviceId: 'svc_1',
    name: 'Lavage et repassage',
    pricing: 'per_piece' as const,
    nature: 'workshop' as const,
    active: true,
    stepIds,
  });
  const plant = site({ siteId: 'sit_c', code: 'C', kind: 'plant', name: 'Centre' });
  const counter = site({ siteId: 'sit_b', code: 'B', kind: 'counter', plantSiteId: 'sit_c' });

  it('links a counter to its plant, and draws a route step by step, in order', () => {
    const flow = businessFlow({
      sites: [plant, counter],
      services: [service(['stp_1', 'stp_2', 'stp_3'])],
      steps,
      words,
    });
    expect(flow.edges).toContainEqual(
      expect.objectContaining({ from: 'site-sit_b', to: 'site-sit_c' }),
    );
    expect(flow.nodes.find((node) => node.id === 'site-sit_b')?.detail).toBe('sends to Centre');
    const lane = flow.nodes.filter((node) => node.kind === 'step').map((node) => node.label);
    expect(lane).toEqual(['Tri', 'Lavage', 'Repassage']);
    // The same settings always draw the same diagram.
    expect(
      businessFlow({
        sites: [plant, counter],
        services: [service(['stp_1', 'stp_2', 'stp_3'])],
        steps,
        words,
      }),
    ).toEqual(flow);
  });

  it('redraws when a step leaves the route, and says when a service has none', () => {
    const shorter = businessFlow({
      sites: [plant],
      services: [service(['stp_1', 'stp_3'])],
      steps,
      words,
    });
    expect(shorter.nodes.filter((n) => n.kind === 'step').map((n) => n.label)).toEqual([
      'Tri',
      'Repassage',
    ]);
    const none = businessFlow({ sites: [plant], services: [service([])], steps, words });
    expect(none.nodes.filter((n) => n.kind === 'step')).toHaveLength(0);
    expect(none.nodes.find((n) => n.kind === 'direct')?.label).toBe('direct');
  });

  it('wraps a route onto the next row on a narrow screen, and stays as wide as two boxes', () => {
    const input = { sites: [plant], services: [service(['stp_1', 'stp_2', 'stp_3'])], steps, words };
    const wide = businessFlow(input);
    const narrow = businessFlow({ ...input, perRow: 2 });
    const rows = (flow: typeof wide) =>
      new Set(flow.nodes.filter((n) => n.kind === 'step' || n.kind === 'service').map((n) => n.y));
    expect(rows(wide).size).toBe(1);
    expect(rows(narrow).size).toBe(2);
    expect(narrow.width).toBeLessThan(wide.width);
    expect(narrow.edges.find((e) => e.to === 'service-svc_1-step-1')).toMatchObject({
      fromSide: 'bottom',
      toSide: 'top',
    });
    // Nothing is drawn outside the diagram's own size.
    for (const node of narrow.nodes) expect(node.x).toBeLessThan(narrow.width);
  });

  it('always shows the life of a deposit, with its way out', () => {
    const flow = businessFlow({ sites: [plant], services: [], steps, words });
    expect(flow.nodes.filter((n) => n.kind === 'state').map((n) => n.label)).toEqual([
      'received',
      'in progress',
      'ready',
      'collected',
      'cancelled',
    ]);
    expect(flow.edges.filter((edge) => edge.aside)).toHaveLength(2);
  });
});

describe('the rights of the business roles', () => {
  it('the owner role holds everything, whatever was ticked', () => {
    const all = businessPermissionList.map((p) => p.name).sort();
    const decided = new Map([['owner' as const, new Map(all.map((name) => [name, false]))]]);
    expect([...permissionsOfRole('owner', businessPermissionList, decided)].sort()).toEqual(all);
  });

  it('a role keeps its defaults for what the owner never touched', () => {
    const defaults = defaultPermissions(businessPermissionList);
    expect(defaults.counter.has('business:read')).toBe(true);
    expect(defaults.counter.has('catalog:manage')).toBe(false);
    const decided = new Map([['counter' as const, new Map([['business:read', false]])]]);
    const held = permissionsOfRole('counter', businessPermissionList, decided);
    expect(held.has('business:read')).toBe(false);
    expect(permissionsOfRole('manager', businessPermissionList, decided).has('catalog:manage')).toBe(
      true,
    );
    expect(permissionsOfRole(null, businessPermissionList, decided).size).toBe(0);
  });
});

describe('the owner starts the laundry (US1)', () => {
  it('nobody but the owner may start it', async () => {
    await hire(kossi, 'manager');
    const input = {
      businessName: 'Pressing Afi',
      profile: 'multi_site',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    };
    expect(await act(kossi, 'business_set_up', input)).toEqual({ ok: false, code: 'not_allowed' });
    expect((await overview()).settings).toBeNull();
  });

  it('prepares a plant, a counter attached to it, four services with routes, and no price', async () => {
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'multi_site',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'a',
    });
    const { settings, sites } = await overview();
    expect(settings).toMatchObject({
      businessName: 'Pressing Afi',
      profile: 'multi_site',
      tracking: 'bag',
      promisedHours: 48,
      discountCeilingPercent: 10,
    });
    const plant = sites.find((s) => s.kind === 'plant');
    const counter = sites.find((s) => s.kind === 'counter');
    expect(plant).toMatchObject({ code: 'C' });
    expect(counter).toMatchObject({ name: 'Agoè', code: 'A', plantSiteId: plant?.siteId });

    const read = await catalog();
    expect(read.steps).toHaveLength(8);
    expect(read.articles).toHaveLength(12);
    expect(read.services.map((s) => s.name)).toEqual([
      'Lavage et repassage',
      'Repassage seul',
      'Nettoyage à sec',
      'Linge au kilo',
    ]);
    const names = new Map(read.steps.map((s) => [s.stepId, s.name]));
    expect(read.services[1]?.stepIds.map((id) => names.get(id))).toEqual([
      'Repassage',
      'Contrôle',
      'Rangement',
    ]);
    // Nettio never proposes a price (constitution III).
    expect(read.prices).toHaveLength(0);
    expect(read.packs).toHaveLength(0);
  });

  it('refuses a second start, and leaves everything as it was', async () => {
    const again = await act(afi, 'business_set_up', {
      businessName: 'Autre',
      profile: 'starting',
      staffing: 'solo',
      siteName: 'Bè',
      siteCode: 'B',
    });
    expect(again).toEqual({ ok: false, code: 'already_set_up' });
    expect((await overview()).sites).toHaveLength(2);
  });

  it('journals the start under the person who did it', async () => {
    const entries = await transaction('org_acme', (tx) => readJournal(tx));
    expect(entries.find((entry) => entry.name === 'set-up-business')).toMatchObject({
      actor: { kind: 'person', id: 'usr_afi' },
      channel: 'web',
    });
  });
});

describe('the owner configures the sites and the catalogue (US3)', () => {
  it('adds a counter attached to the plant, and refuses a code already used', async () => {
    const { sites } = await overview();
    const plant = sites.find((s) => s.kind === 'plant');
    await done(afi, 'business_save_site', {
      name: 'Bè',
      code: 'B',
      kind: 'counter',
      plantSiteId: plant?.siteId,
    });
    expect(
      await act(afi, 'business_save_site', { name: 'Bè 2', code: 'B', kind: 'counter_plant' }),
    ).toEqual({ ok: false, code: 'site_code_taken' });
    expect((await overview()).sites).toHaveLength(3);
  });

  it('sets a price for an article and a service, and removes it', async () => {
    const read = await catalog();
    const service = read.services[0];
    const shirt = read.articles.find((a) => a.name === 'Chemise');
    const price = { serviceId: service?.serviceId, articleId: shirt?.articleId };
    await done(afi, 'catalog_set_price', { ...price, amount: 500 });
    await done(afi, 'catalog_set_price', { ...price, amount: 600 });
    expect((await catalog()).prices).toEqual([{ ...price, amount: 600 }]);
    await done(afi, 'catalog_set_price', { ...price, amount: null });
    expect((await catalog()).prices).toHaveLength(0);
    // A per-kilo service has no price per article.
    const byKilo = read.services.find((s) => s.pricing === 'per_kg');
    expect(
      await act(afi, 'catalog_set_price', {
        serviceId: byKilo?.serviceId,
        articleId: shirt?.articleId,
        amount: 100,
      }),
    ).toEqual({ ok: false, code: 'price_per_kilo_has_no_article' });
  });

  it('changes the route of a service, and keeps a step that is on a route', async () => {
    const read = await catalog();
    const service = read.services.find((s) => s.name === 'Repassage seul');
    const ironing = read.steps.find((s) => s.name === 'Repassage');
    const storing = read.steps.find((s) => s.name === 'Rangement');
    await done(afi, 'catalog_save_service', {
      ...service,
      stepIds: [ironing?.stepId, storing?.stepId],
    });
    const after = (await catalog()).services.find((s) => s.serviceId === service?.serviceId);
    expect(after?.stepIds).toEqual([ironing?.stepId, storing?.stepId]);
    expect(
      await act(afi, 'catalog_save_step', { ...ironing, active: false }),
    ).toEqual({ ok: false, code: 'step_on_a_route' });
    expect(
      await act(afi, 'catalog_save_service', { ...service, stepIds: ['stp_unknown'] }),
    ).toEqual({ ok: false, code: 'route_step_unknown' });
  });

  it('adds a pack on the services of its mode', async () => {
    const read = await catalog();
    const piece = read.services.find((s) => s.pricing === 'per_piece');
    const kilo = read.services.find((s) => s.pricing === 'per_kg');
    await done(afi, 'catalog_save_pack', {
      name: 'Business 12 pièces',
      mode: 'pieces',
      quota: 12,
      price: 6000,
      serviceIds: [piece?.serviceId],
    });
    expect(
      await act(afi, 'catalog_save_pack', {
        name: 'Faux',
        mode: 'pieces',
        quota: 5,
        price: 1000,
        serviceIds: [kilo?.serviceId],
      }),
    ).toEqual({ ok: false, code: 'pack_service_wrong_mode' });
    expect((await catalog()).packs).toMatchObject([{ name: 'Business 12 pièces', quota: 12 }]);
  });
});

describe('each person a role, each role its rights (US4)', () => {
  const team = () =>
    done<{ staff: StaffMember[]; roles: { role: string; permissions: string[] }[] }>(
      afi,
      'team_read',
      {},
    );

  it('a member with no role sees nothing, nor an agent acting for her', async () => {
    await hire(mawuli, null);
    for (const caller of [onScreen(mawuli), agentFor(mawuli)]) {
      expect(
        await asPerson(mawuli, () =>
          registry.invoke({ ...caller, name: 'business_overview', input: {} }),
        ),
      ).toEqual({ status: 'refused', reason: 'not_allowed' });
    }
    expect((await team()).staff.find((s) => s.userId === 'usr_mawuli')).toMatchObject({
      role: null,
    });
  });

  it('given the counter role, she reads the business and cannot change the catalogue', async () => {
    const waiting = (await team()).staff.find((s) => s.userId === 'usr_mawuli');
    await done(afi, 'team_set_role', { staffId: waiting?.staffId, role: 'counter' });
    expect((await act(mawuli, 'business_overview', {})).ok).toBe(true);
    expect(await act(mawuli, 'catalog_save_article', { name: 'Cravate' })).toEqual({
      ok: false,
      code: 'not_allowed',
    });
    expect(await act(mawuli, 'team_read', {})).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('what the owner unticks is refused at the next request, on every surface', async () => {
    await done(afi, 'team_set_role_permissions', { role: 'counter', permissions: [] });
    expect(await act(mawuli, 'business_overview', {})).toEqual({ ok: false, code: 'not_allowed' });
    expect(
      await asPerson(mawuli, () =>
        registry.invoke({ ...agentFor(mawuli), name: 'catalog_read', input: {} }),
      ),
    ).toEqual({ status: 'refused', reason: 'not_allowed' });
    await done(afi, 'team_set_role_permissions', {
      role: 'counter',
      permissions: ['business:read'],
    });
    expect((await act(mawuli, 'business_overview', {})).ok).toBe(true);
  });

  it('the owner role cannot be changed, nor an unknown permission ticked', async () => {
    expect(
      await act(afi, 'team_set_role_permissions', { role: 'owner', permissions: [] }),
    ).toEqual({ ok: false, code: 'owner_keeps_everything' });
    expect(
      await act(afi, 'team_set_role_permissions', { role: 'counter', permissions: ['nope:never'] }),
    ).toEqual({ ok: false, code: 'permission_unknown' });
  });

  it('a retired person sees nothing any more', async () => {
    const member = (await team()).staff.find((s) => s.userId === 'usr_mawuli');
    await done(afi, 'team_set_role', { staffId: member?.staffId, role: 'counter', active: false });
    expect(await act(mawuli, 'business_overview', {})).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('nobody signed in may do anything', async () => {
    expect(
      await asPerson(null, () =>
        registry.invoke({ ...onScreen(afi), name: 'business_overview', input: {} }),
      ),
    ).toEqual({ status: 'refused', reason: 'not_allowed' });
  });

  it('follows the grants of Kete Enterprise once it manages the app’s rights', async () => {
    process.env.ENTERPRISE_API_URL = 'https://api.center.test';
    const asked: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      asked.push(url);
      return Response.json({
        managed: true,
        permissions: [{ permission: 'catalog:manage', everywhere: true, units: [] }],
      });
    });
    const efua = person('usr_efua', 'member');
    try {
      // Efua has no role in the laundry; her position at the center lets her manage the catalogue.
      const added = await asPerson(
        efua,
        () =>
          registry.invoke({
            ...onScreen(efua),
            name: 'catalog_save_article',
            input: { name: 'Cravate' },
          }),
        'efua-token',
      );
      expect(added).toMatchObject({ status: 'done' });
      expect(asked).toEqual(['https://api.center.test/v1/apps/prd_nettio/grants']);
      // Without a token, her last grants stand in: reading the business was not granted.
      expect(
        await asPerson(efua, () =>
          registry.invoke({ ...onScreen(efua), name: 'business_overview', input: {} }),
        ),
      ).toEqual({ status: 'refused', reason: 'not_allowed' });
    } finally {
      vi.unstubAllGlobals();
      delete process.env.ENTERPRISE_API_URL;
    }
  });
});

describe('an agent prepares, a person validates', () => {
  it('a copilot prepares a price the owner dictated; nothing changes until she validates', async () => {
    const read = await catalog();
    const service = read.services[0];
    const shirt = read.articles.find((a) => a.name === 'Chemise');
    const client = await connect(afi);
    const prepared = await client.callTool({
      name: 'catalog_set_price',
      arguments: { serviceId: service?.serviceId, articleId: shirt?.articleId, amount: 500 },
    });
    const { draftId } = prepared.structuredContent as { draftId: string };
    expect(prepared.structuredContent).toMatchObject({ status: 'draft' });
    expect((await catalog()).prices).toHaveLength(0);

    const validated = await client.callTool({ name: 'kete_draft_validate', arguments: { draftId } });
    expect(validated.structuredContent).toMatchObject({ status: 'validated' });
    expect((await catalog()).prices).toEqual([
      { serviceId: service?.serviceId, articleId: shirt?.articleId, amount: 500 },
    ]);
    await client.close();
  });

  it('a copilot reads the catalogue with what is missing before the counter can sell', async () => {
    const read = await asPerson(afi, () =>
      registry.invoke({ ...agentFor(afi), name: 'catalog_read', input: {} }),
    );
    expect(read).toMatchObject({
      status: 'done',
      output: { gaps: { servicesWithoutPrice: expect.arrayContaining(['Linge au kilo']) } },
    });
  });
});

describe('the organization is the boundary', () => {
  const tables: Record<string, (org: string) => string[]> = {
    settings: (org) => [
      `insert into settings (organization_id, business_name, profile, staffing)
       values ('${org}', 'x', 'starting', 'solo')`,
    ],
    sites: (org) => [
      `insert into sites (site_id, organization_id, name, code, kind)
       values ('sit_${org}', '${org}', 'x', 'X', 'counter_plant')`,
    ],
    staff: (org) => [
      `insert into staff (staff_id, organization_id, user_id, name)
       values ('stf_${org}', '${org}', 'usr_x', 'x')`,
    ],
    role_permissions: (org) => [
      `insert into role_permissions (organization_id, role, permission, granted)
       values ('${org}', 'counter', 'business:read', true)`,
    ],
    articles: (org) => [
      `insert into articles (article_id, organization_id, name) values ('art_${org}', '${org}', 'x')`,
    ],
    steps: (org) => [
      `insert into steps (step_id, organization_id, name) values ('stp_${org}', '${org}', 'x')`,
    ],
    services: (org) => [
      `insert into services (service_id, organization_id, name, nature, pricing)
       values ('svc_${org}', '${org}', 'x', 'workshop', 'per_piece')`,
    ],
    service_steps: (org) => [
      `insert into services (service_id, organization_id, name, nature, pricing)
       values ('svc_r_${org}', '${org}', 'x', 'workshop', 'per_piece')`,
      `insert into steps (step_id, organization_id, name) values ('stp_r_${org}', '${org}', 'x')`,
      `insert into service_steps (organization_id, service_id, step_id, position)
       values ('${org}', 'svc_r_${org}', 'stp_r_${org}', 0)`,
    ],
    prices: (org) => [
      `insert into services (service_id, organization_id, name, nature, pricing)
       values ('svc_p_${org}', '${org}', 'x', 'workshop', 'per_kg')`,
      `insert into prices (price_id, organization_id, service_id, amount)
       values ('prc_${org}', '${org}', 'svc_p_${org}', 100)`,
    ],
    packs: (org) => [
      `insert into packs (pack_id, organization_id, name, mode, quota, price)
       values ('pck_${org}', '${org}', 'x', 'pieces', 10, 1000)`,
    ],
  };

  it.each(Object.keys(tables))('keeps each organization’s %s to itself (RLS)', async (table) => {
    await assertOrganizationIsolation({
      app: db.app,
      table,
      organizations: ['org_x', 'org_y'],
      insert: async (client, organizationId) => {
        for (const sql of tables[table]?.(organizationId) ?? []) await client.query(sql);
      },
    });
  });

  it('another organization starts its own laundry, and sees only its own', async () => {
    const yao = person('usr_yao', 'owner', 'org_other');
    await done(yao, 'business_set_up', {
      businessName: 'Pressing Yao',
      profile: 'starting',
      staffing: 'solo',
      siteName: 'Kara',
      siteCode: 'K',
      locale: 'en',
    });
    const theirs = await done<{ settings: Settings; sites: Site[] }>(yao, 'business_overview', {});
    expect(theirs.sites).toMatchObject([{ name: 'Kara', kind: 'counter_plant' }]);
    expect((await done<Catalog>(yao, 'catalog_read', {})).services[0]?.name).toBe('Wash and iron');
    expect((await overview()).settings?.businessName).toBe('Pressing Afi');
  });
});

describe('what the app says about itself', () => {
  it('serves a valid manifest: its capabilities, its permissions with their words', () => {
    const card = manifest();
    expect(validateManifest(card).ok).toBe(true);
    expect(card).toMatchObject({ product: 'prd_nettio', name: 'Nettio' });
    expect(card.capabilities?.map((c) => c.name)).toEqual(
      expect.arrayContaining(['business_overview', 'business_set_up', 'catalog_read', 'team_read']),
    );
    const manage = card.permissions?.find((p) => p.name === 'catalog:manage');
    expect(manage).toMatchObject({ roles: ['owner', 'admin'] });
    expect(manage?.label.fr).toBeTruthy();
    expect(manage?.label.en).toBeTruthy();
    expect(card.governance).toMatchObject({
      dataCategories: ['personal', 'financial', 'confidential'],
    });
  });

  it('says the same words in every language', () => {
    const fr = JSON.parse(readFileSync(new URL('../messages/fr.json', import.meta.url), 'utf8'));
    const en = JSON.parse(readFileSync(new URL('../messages/en.json', import.meta.url), 'utf8'));
    expect(Object.keys(en).sort()).toEqual(Object.keys(fr).sort());
    for (const key of Object.keys(fr)) expect(String(en[key]).trim(), key).not.toBe('');
  });
});
