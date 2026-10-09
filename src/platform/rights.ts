import type { KeteIdentity } from '@kete/auth';
import { createRights } from '@kete/capabilities';
import { AsyncLocalStorage } from 'node:async_hooks';
import { findStaffOf, permissionsOfRole, readRolePermissions } from '@/features/business';
import { getCenter } from './center';
import { transaction } from './db';
import { businessPermissionList, permissions } from './permissions';

export { permissions };

// Whether the center answered that it manages this app's rights, for the request being read.
const probe = new AsyncLocalStorage<{ managed: boolean | null }>();
// People whose rights the center manages, and until when its last answer stands in (24 h).
const managedUntil = new Map<string, number>();
const DAY = 86_400_000;

const rights = createRights({
  permissions,
  grants: async (token) => {
    const grants = await getCenter().grants(token);
    const store = probe.getStore();
    if (store && grants) store.managed = grants.managed;
    return grants;
  },
});

const current = new AsyncLocalStorage<{
  identity: KeteIdentity | null;
  permissions: Set<string>;
}>();

/**
 * What the person holds in Nettio (specs/001-foundation):
 * 1. once her organization manages the app's rights at the center, its grants decide;
 * 2. the owner and the admins of the Compte Kete organization are owners of the laundry;
 * 3. anyone else holds what the owner ticked for her business role — nothing without a role.
 */
async function permissionsFor(identity: KeteIdentity, token?: string | null): Promise<Set<string>> {
  const answer: { managed: boolean | null } = { managed: null };
  const base = await probe.run(answer, () => rights.permissionsOf(identity, token));
  if (answer.managed === true) {
    if (managedUntil.size >= 5000) managedUntil.clear();
    managedUntil.set(identity.userId, Date.now() + DAY);
  }
  if (answer.managed === false) managedUntil.delete(identity.userId);
  if ((managedUntil.get(identity.userId) ?? 0) > Date.now()) return base;
  if (identity.role === 'owner' || identity.role === 'admin') return base;
  const organizationId = identity.organizationId;
  if (!organizationId) return new Set();
  return transaction(organizationId, async (db) => {
    const staff = await findStaffOf(db, identity.userId);
    if (!staff?.active || !staff.role) return new Set<string>();
    return permissionsOfRole(staff.role, businessPermissionList, await readRolePermissions(db));
  });
}

/**
 * Runs `work` for this person: every right checked within it is hers. An agent acting for her
 * runs within her request: it never has more rights than she has (doctrine).
 */
export async function asPerson<T>(
  identity: KeteIdentity | null,
  work: () => T | Promise<T>,
  token?: string | null,
): Promise<T> {
  const held = identity ? await permissionsFor(identity, token) : new Set<string>();
  return current.run({ identity, permissions: held }, work);
}

/**
 * Runs `work` with what a person of the team holds by her business role, for a path that has no
 * session — a message she sent from her own WhatsApp or Telegram (specs/023-ask-by-messaging).
 * Null when she holds nothing: retired, or without a role.
 */
export async function asStaff<T>(
  person: { organizationId: string; userId: string },
  work: (may: (permission: string) => boolean) => Promise<T>,
): Promise<T | null> {
  const held = await transaction(person.organizationId, async (db) => {
    const staff = await findStaffOf(db, person.userId);
    if (!staff?.active || !staff.role) return null;
    return {
      name: staff.name,
      permissions: permissionsOfRole(staff.role, businessPermissionList, await readRolePermissions(db)),
    };
  });
  if (!held) return null;
  const identity: KeteIdentity = {
    userId: person.userId,
    email: '',
    name: held.name,
    organizationId: person.organizationId,
    role: 'member',
    apps: {},
    twoFactor: false,
    expiresAt: new Date(Date.now() + 60_000),
  };
  return current.run({ identity, permissions: held.permissions }, () =>
    work((permission) => held.permissions.has(permission)),
  );
}

export function currentIdentity(): KeteIdentity | null {
  return current.getStore()?.identity ?? null;
}

/** Whether the person of this request holds `permission` in her organization. */
export function holds(permission: string): boolean {
  return current.getStore()?.permissions.has(permission) ?? false;
}

/** Everything the person of this request holds: what her screens may show. */
export function heldPermissions(): string[] {
  return [...(current.getStore()?.permissions ?? [])].sort();
}
