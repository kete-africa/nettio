import { defineCommand } from '@kete/commands';
import { seedCatalog } from '@/features/catalog';
import { RuleError } from '@/lib/rule-error';
import { businessPermissionList } from '@/platform/permissions';
import {
  rolePermissionsInput,
  settingsInput,
  setUpInput,
  siteInput,
  staffRoleInput,
} from './business.record';
import { checkSite } from './domain/sites';
import { starterFor } from './domain/starter';
import {
  insertSettings,
  listSites,
  readSettings,
  saveSite,
  setStaffRole,
  updateSettings,
  writeRolePermissions,
} from './infrastructure/business.tables';
import { starterWords } from './starter-words';

/**
 * Starts the laundry, once: its settings, its first sites, the usual steps, four services with
 * their routes and twelve articles. Names only — never a price (constitution III).
 */
export const setUpBusiness = defineCommand({
  name: 'set-up-business',
  input: setUpInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (await readSettings(db)) throw new RuleError('already_set_up');
    const starter = starterFor(input, starterWords(input.locale));
    await insertSettings(db, organizationId, input);
    let plantSiteId: string | null = null;
    const siteIds: string[] = [];
    for (const site of starter.sites) {
      const siteId = await saveSite(db, organizationId, {
        name: site.name,
        code: site.code,
        kind: site.kind,
        plantSiteId: site.attachedToPlant ? plantSiteId : null,
        active: true,
      });
      if (site.kind === 'plant') plantSiteId = siteId;
      siteIds.push(siteId);
    }
    await seedCatalog(db, organizationId, starter);
    return { siteIds };
  },
  summarize: (input) => `Laundry "${input.businessName}" started (${input.profile})`,
});

/** Changes how the laundry works: delays, tracking grain, ceilings, the cost of a minute. */
export const changeSettings = defineCommand({
  name: 'change-settings',
  input: settingsInput,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    if (!(await readSettings(db))) throw new RuleError('not_set_up');
    await updateSettings(db, input);
    return { changed: true };
  },
  summarize: () => 'Settings changed',
});

/** Adds a site or changes it: its name, its code, what it does, the plant it sends to. */
export const saveSiteCommand = defineCommand({
  name: 'save-site',
  input: siteInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (!(await readSettings(db))) throw new RuleError('not_set_up');
    checkSite(input, await listSites(db));
    const siteId = await saveSite(db, organizationId, input);
    if (!siteId) throw new RuleError('not_found');
    return { siteId };
  },
  summarize: (input) => `Site "${input.name}" (${input.code}) saved`,
});

/** Gives a person her role in the laundry, and the sites she works at. */
export const setStaffRoleCommand = defineCommand({
  name: 'set-staff-role',
  input: staffRoleInput,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    const sites = new Set((await listSites(db)).map((site) => site.siteId));
    if (input.siteIds.some((siteId) => !sites.has(siteId))) throw new RuleError('not_found');
    if (!(await setStaffRole(db, input))) throw new RuleError('not_found');
    return { staffId: input.staffId, role: input.role };
  },
  summarize: (input) => `Role of ${input.staffId} set to ${input.role ?? 'none'}`,
});

/** Ticks what a business role may do. The owner role holds everything, always. */
export const setRolePermissions = defineCommand({
  name: 'set-role-permissions',
  input: rolePermissionsInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (input.role === 'owner') throw new RuleError('owner_keeps_everything');
    const declared = businessPermissionList.map((permission) => permission.name);
    if (input.permissions.some((name) => !declared.includes(name))) {
      throw new RuleError('permission_unknown');
    }
    const ticked = new Set(input.permissions);
    await writeRolePermissions(
      db,
      organizationId,
      input.role,
      new Map(declared.map((name) => [name, ticked.has(name)])),
    );
    return { role: input.role, permissions: [...ticked].sort() };
  },
  summarize: (input) => `Rights of the ${input.role} role set (${input.permissions.length})`,
});
