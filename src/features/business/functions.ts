import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { getLocale } from '@/paraglide/runtime.js';
import { transaction } from '@/platform/db';
import { businessPermissionList } from '@/platform/permissions';
import { PRODUCT } from '@/platform/app';
import { asPerson, heldPermissions } from '@/platform/rights';
import { perform } from '@/platform/screen';
import { deviceOwnerOf, personOf, tokenOf } from '@/platform/session';
import {
  rolePermissionsInput,
  settingsInput,
  setUpInput,
  siteInput,
  staffRoleInput,
  type BusinessRole,
  type Settings,
  type Site,
  type StaffMember,
} from './business.record';
import { findStaffOf, notePresence, readSettings } from './infrastructure/business.tables';

/** The person on a screen, as the shell needs her: her name, her role, what she may open. */
export interface Me {
  userId: string;
  name: string;
  /** Null while she has no organization at the Compte Kete. */
  organizationId: string | null;
  /** Her business role; null while she waits for the owner to give her one. */
  role: BusinessRole | null;
  permissions: string[];
  /** On a shared device she took over with her code: who signed it in (specs/025-manager). */
  onDeviceOf: string | null;
  /**
   * What the Compte Kete says of the organization's access to Nettio (specs/030-standalone): until
   * when it runs, where it is managed, and whether this deployment asks for it.
   */
  access: { until: string | null; active: boolean; required: boolean; accountUrl: string };
  /** Null while the laundry is not set up. */
  business: Pick<Settings, 'businessName' | 'profile' | 'staffing'> | null;
}

/**
 * Who is signed in, or null. Her presence is noted so that the owner finds her in the team; the
 * owner and the admins of the Compte Kete organization are owners of the laundry at once.
 */
export const fetchMe = createServerFn({ method: 'GET' }).handler(async (): Promise<Me | null> => {
  const request = getRequest();
  const identity = await personOf(request);
  if (!identity) return null;
  const organizationId = identity.organizationId;
  if (!organizationId) {
    return {
      userId: identity.userId,
      name: identity.name,
      organizationId: null,
      role: null,
      permissions: [],
      onDeviceOf: null,
      access: accessOf(identity.apps),
      business: null,
    };
  }
  const { staff, settings } = await transaction(organizationId, async (db) => {
    const role = identity.role === 'owner' || identity.role === 'admin' ? 'owner' : null;
    let staff = await findStaffOf(db, identity.userId);
    if (!staff || staff.name !== identity.name || (role && !staff.role)) {
      await notePresence(db, organizationId, { userId: identity.userId, name: identity.name, role });
      staff = await findStaffOf(db, identity.userId);
    }
    return { staff, settings: await readSettings(db) };
  });
  const device = await deviceOwnerOf(request);
  return asPerson(
    identity,
    () => ({
      userId: identity.userId,
      name: identity.name,
      organizationId,
      role: staff?.active ? staff.role : null,
      permissions: heldPermissions(),
      onDeviceOf: device && device.userId !== identity.userId ? device.name : null,
      // The subscription is the organization's: read on the session that carries its token.
      access: accessOf((device ?? identity).apps),
      business: settings
        ? {
            businessName: settings.businessName,
            profile: settings.profile,
            staffing: settings.staffing,
          }
        : null,
    }),
    await tokenOf(request),
  );
});

/** The organization's access to Nettio, as the Compte Kete's token says it. */
function accessOf(apps: Record<string, Date>): Me['access'] {
  const until = apps[PRODUCT] ?? null;
  return {
    until: until ? until.toISOString() : null,
    active: until !== null && until.getTime() > Date.now(),
    required: process.env.NETTIO_REQUIRE_SUBSCRIPTION === 'on',
    accountUrl: process.env.KETE_ACCOUNT_URL ?? '',
  };
}

export const fetchBusiness = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<{ settings: Settings | null; sites: Site[] }>('business_overview', {});
  return read.ok ? read.output : null;
});

export interface TeamView {
  staff: StaffMember[];
  roles: { role: BusinessRole; permissions: string[] }[];
  /** Every permission with its words, in the person's language, and its default holders. */
  permissions: { name: string; label: string; description: string }[];
}

export const fetchTeam = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TeamView | null> => {
    const read = await perform<Pick<TeamView, 'staff' | 'roles'>>('team_read', {});
    if (!read.ok) return null;
    const locale = getLocale() === 'en' ? 'en' : 'fr';
    return {
      ...read.output,
      permissions: businessPermissionList.map((permission) => ({
        name: permission.name,
        label: permission.label[locale],
        description: permission.description?.[locale] ?? '',
      })),
    };
  },
);

export const startBusiness = createServerFn({ method: 'POST' })
  .validator((input: unknown) => setUpInput.parse(input))
  .handler(({ data }) => perform<{ siteIds: string[] }>('business_set_up', data));

export const saveSettings = createServerFn({ method: 'POST' })
  .validator((input: unknown) => settingsInput.parse(input))
  .handler(({ data }) => perform<{ changed: boolean }>('business_change_settings', data));

export const saveSite = createServerFn({ method: 'POST' })
  .validator((input: unknown) => siteInput.parse(input))
  .handler(({ data }) => perform<{ siteId: string }>('business_save_site', data));

export const saveStaffRole = createServerFn({ method: 'POST' })
  .validator((input: unknown) => staffRoleInput.parse(input))
  .handler(({ data }) => perform<{ staffId: string }>('team_set_role', data));

export const saveRolePermissions = createServerFn({ method: 'POST' })
  .validator((input: unknown) => rolePermissionsInput.parse(input))
  .handler(({ data }) => perform<{ role: BusinessRole }>('team_set_role_permissions', data));
