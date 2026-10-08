import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { businessPermissionList } from '@/platform/permissions';
import {
  businessRoles,
  rolePermissionsInput,
  settingsInput,
  setUpInput,
  siteInput,
  staffRoleInput,
} from './business.record';
import {
  changeSettings,
  saveSiteCommand,
  setRolePermissions,
  setStaffRoleCommand,
  setUpBusiness,
} from './commands';
import { permissionsOfRole } from './domain/roles';
import {
  listSites,
  listStaff,
  readRolePermissions,
  readSettings,
} from './infrastructure/business.tables';

/**
 * What a screen, a copilot or an agent may do with the business itself. Reading is free for
 * whoever works there; setting it commits how the laundry runs, so an agent only prepares the
 * change (level 3) and a person validates it.
 */
export const businessCapabilities = [
  defineCapability({
    name: 'business_overview',
    description:
      'The laundry as its owner set it: its name, profile, how it works (delays, tracking grain, ceilings) and its sites. Null settings mean it is not set up yet.',
    permission: 'business:read',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db }) {
      return { settings: await readSettings(db), sites: await listSites(db) };
    },
  }),
  defineCapability({
    name: 'business_set_up',
    description:
      'Starts the laundry, once: its name, profile (starting, established, multi_site), solo or team, and its first site. Prepares the usual steps, services and articles — never a price.',
    permission: 'settings:manage',
    autonomy: 3,
    input: setUpInput,
    command: setUpBusiness,
    draft: { recordType: 'business' },
  }),
  defineCapability({
    name: 'business_change_settings',
    description:
      'Changes how the laundry works: promised and express delays, express surcharge, discount ceiling, tracking at the bag or the piece, working days, the cost of a minute of work.',
    permission: 'settings:manage',
    autonomy: 3,
    input: settingsInput,
    command: changeSettings,
    draft: { recordType: 'settings' },
  }),
  defineCapability({
    name: 'business_save_site',
    description:
      'Adds a site or changes it: a counter (receives deposits), a plant (processes), or both; a counter names the plant it sends to.',
    permission: 'settings:manage',
    autonomy: 3,
    input: siteInput,
    command: saveSiteCommand,
    draft: { recordType: 'site' },
  }),
  defineCapability({
    name: 'team_read',
    description:
      'The team of the laundry: each person, her business role (null while she waits for one), her sites; and what each role may do.',
    permission: 'staff:manage',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db }) {
      const decided = await readRolePermissions(db);
      return {
        staff: await listStaff(db),
        roles: businessRoles.map((role) => ({
          role,
          permissions: [...permissionsOfRole(role, businessPermissionList, decided)].sort(),
        })),
      };
    },
  }),
  defineCapability({
    name: 'team_set_role',
    description: 'Gives a person her business role and the sites she works at, or retires her.',
    permission: 'staff:manage',
    autonomy: 3,
    input: staffRoleInput,
    command: setStaffRoleCommand,
    draft: { recordType: 'staff_role' },
  }),
  defineCapability({
    name: 'team_set_role_permissions',
    description: 'Sets the full list of what a business role may do. The owner role cannot change.',
    permission: 'staff:manage',
    autonomy: 3,
    input: rolePermissionsInput,
    command: setRolePermissions,
    draft: { recordType: 'role_permissions' },
  }),
];
