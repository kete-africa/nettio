import type { KeteIdentity } from '@kete/auth';
import { createRights, definePermissions } from '@kete/capabilities';
import { AsyncLocalStorage } from 'node:async_hooks';
import { taskPermissions } from '@/features/tasks';
import * as m from '@/paraglide/messages.js';
import { getCenter } from './center';
import { words } from './words';

/**
 * Every permission the app checks, with its words and its default roles (kete-core spec 049): each
 * feature declares its own. The manifest describes them; Kete Enterprise lets an administrator
 * grant them to roles and positions.
 */
export const permissions = definePermissions([
  ...taskPermissions,
  // The organization's journal: who did what, agents included (@kete/admin).
  {
    name: 'journal:read',
    label: words(m.perm_journal_read),
    description: words(m.perm_journal_read_body),
    roles: ['owner', 'admin'],
  },
]);

const rights = createRights({ permissions, grants: (token) => getCenter().grants(token) });

const current = new AsyncLocalStorage<{
  identity: KeteIdentity | null;
  permissions: Set<string>;
}>();

/**
 * Runs `work` for this person: every right checked within it is hers — her grants at the center,
 * read with her token, or the defaults of her role.
 */
export async function asPerson<T>(
  identity: KeteIdentity | null,
  work: () => T | Promise<T>,
  token?: string | null,
): Promise<T> {
  const held = identity ? await rights.permissionsOf(identity, token) : new Set<string>();
  return current.run({ identity, permissions: held }, work);
}

export function currentIdentity(): KeteIdentity | null {
  return current.getStore()?.identity ?? null;
}

/**
 * Whether the person of this request holds `permission` in her organization. An agent acting for
 * her runs within her request: it never has more rights than she has (doctrine).
 */
export function holds(permission: string): boolean {
  return current.getStore()?.permissions.has(permission) ?? false;
}
