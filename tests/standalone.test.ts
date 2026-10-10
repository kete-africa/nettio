import type { TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import { saveCode } from '../src/features/manager/infrastructure/manager.tables';
import { EXPORTED_TABLES, NOT_EXPORTED, type DataExport } from '../src/features/portability';
import { transaction } from '../src/platform/db';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// Nettio sold alone (specs/030-standalone): a laundry's data is its own — exported whole, by its
// owner, without the secrets, and never another laundry's.

describe('the laundry’s data, exported whole', () => {
  let db: TestSchema;
  const afi = person('usr_afi', 'owner');
  const mawuli = person('usr_mawuli', 'member'); // counter
  const kossi = person('usr_kossi', 'member'); // manager
  const other = person('usr_bob', 'owner', 'org_other');

  const setUp = async (owner: typeof afi, name: string, customer: string) => {
    await done(owner, 'business_set_up', {
      businessName: name,
      profile: 'starting',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    const site = (await done<{ sites: Site[] }>(owner, 'business_overview', {})).sites[0] as Site;
    const read = await done<Catalog>(owner, 'catalog_read', {});
    const serviceId = read.services.find((service) => service.name === 'Lavage et repassage')?.serviceId;
    const articleId = read.articles.find((article) => article.name === 'Chemise')?.articleId;
    await done(owner, 'catalog_set_price', { serviceId, articleId, amount: 500 });
    await done(owner, 'orders_receive', {
      siteId: site.siteId,
      phone: '90 12 34 56',
      customerName: customer,
      lines: [{ serviceId, articleId, quantity: 4 }],
    });
  };

  beforeAll(async () => {
    db = await freshSchema();
    await setUp(afi, 'Pressing Afi', 'Mme Adjovi');
    await setUp(other, 'Pressing Bob', 'M. Koffi');
    await hire(afi, 'owner');
    await hire(mawuli, 'counter');
    await hire(kossi, 'manager');
    // Secrets exist: a personal code, a messaging link.
    await transaction('org_acme', (client) => saveCode(client, 'org_acme', mawuli.userId, '482913'));
    await done(afi, 'assistant_messaging', {});
  }, 300_000);

  afterAll(async () => {
    await db.drop();
  });

  it('every table is exported, or left out for a reason that is written down', async () => {
    const { rows } = await db.app.query<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = $1`,
      [db.schema],
    );
    const created = rows.map((row) => row.table_name).filter((name) => !name.startsWith('kete_'));
    const decided = new Set<string>([...EXPORTED_TABLES, ...Object.keys(NOT_EXPORTED)]);
    expect(created.filter((table) => !decided.has(table))).toEqual([]);
    expect([...decided].filter((table) => !created.includes(table))).toEqual([]);
    expect(EXPORTED_TABLES.filter((table) => table in NOT_EXPORTED)).toEqual([]);
  }, 120_000);

  it('the owner exports everything her laundry recorded — and only hers', async () => {
    const exported = await done<DataExport>(afi, 'data_export', {});
    expect(exported).toMatchObject({ product: 'nettio', organizationId: 'org_acme', missing: [] });
    expect(Object.keys(exported.tables).sort()).toEqual([...EXPORTED_TABLES].sort());
    expect(exported.tables.settings).toHaveLength(1);
    expect(exported.tables.settings?.[0]).toMatchObject({ business_name: 'Pressing Afi' });
    expect(exported.tables.customers?.map((customer) => customer.name)).toEqual(['Mme Adjovi']);
    expect(exported.tables.orders).toHaveLength(1);
    expect(exported.tables.order_items?.[0]).toMatchObject({ article_name: 'Chemise', amount: 2_000 });
    // Row by row, nothing of another laundry.
    for (const rows of Object.values(exported.tables)) {
      expect(rows.every((row) => row.organization_id === undefined || row.organization_id === 'org_acme')).toBe(true);
    }
    expect(JSON.stringify(exported)).not.toContain('M. Koffi');
    expect(JSON.stringify(exported)).not.toContain('Pressing Bob');
  }, 120_000);

  it('no secret leaves: neither a personal code’s hash nor a link’s token', async () => {
    const exported = await done<DataExport>(afi, 'data_export', {});
    expect(exported.tables.staff_codes).toBeUndefined();
    const columns = new Set(Object.values(exported.tables).flatMap((rows) => rows.flatMap((row) => Object.keys(row))));
    expect(columns.has('code_hash')).toBe(false);
    expect(columns.has('link_token')).toBe(false);
    // The messaging link is there — who tied what — without the token that ties it.
    expect(exported.tables.staff_messaging).toHaveLength(1);
    expect(exported.tables.staff_messaging?.[0]).toMatchObject({ user_id: afi.userId });
    expect(JSON.stringify(exported)).not.toMatch(/ask_[A-Za-z0-9_-]{8,}/);
  }, 120_000);

  it('only the owner exports: not a manager, not a clerk — and an agent reads with her rights only', async () => {
    expect(await act(kossi, 'data_export', {})).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(mawuli, 'data_export', {})).toEqual({ ok: false, code: 'not_allowed' });
    const refused = await asPerson(mawuli, () => registry.invoke({ ...agentFor(mawuli), name: 'data_export', input: {} }));
    expect(refused).toMatchObject({ status: 'refused' });
    // The other laundry's owner gets her own, never this one.
    const theirs = await done<DataExport>(other, 'data_export', {});
    expect(theirs.organizationId).toBe('org_other');
    expect(theirs.tables.customers?.map((customer) => customer.name)).toEqual(['M. Koffi']);
  }, 120_000);
});
