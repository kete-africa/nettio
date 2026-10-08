import type { PermissionDefinition } from '@kete/capabilities';
import { businessRoles, type BusinessRole } from '../business.record';

/**
 * A permission of Nettio: besides the Compte Kete roles that hold it when nothing else decides
 * (the chassis contract), the business roles that hold it until the owner ticks otherwise
 * (docs/product/referentiels.md).
 */
export interface BusinessPermission extends PermissionDefinition {
  staff: readonly BusinessRole[];
}

/**
 * What each business role may do before the owner changes anything. The owner role holds
 * everything, always: an owner cannot lock himself out.
 */
export function defaultPermissions(
  permissions: readonly BusinessPermission[],
): Record<BusinessRole, Set<string>> {
  const all = permissions.map((p) => p.name);
  return Object.fromEntries(
    businessRoles.map((role) => [
      role,
      new Set(
        role === 'owner' ? all : permissions.filter((p) => p.staff.includes(role)).map((p) => p.name),
      ),
    ]),
  ) as Record<BusinessRole, Set<string>>;
}

/**
 * What a person with `role` holds: the defaults of her role, changed by what the owner ticked or
 * unticked — a permission he never touched keeps its default, so a new one arrives with it. Only
 * what the app declares; nothing without a role.
 */
export function permissionsOfRole(
  role: BusinessRole | null,
  permissions: readonly BusinessPermission[],
  decided: Map<BusinessRole, Map<string, boolean>>,
): Set<string> {
  if (!role) return new Set();
  const defaults = defaultPermissions(permissions)[role];
  if (role === 'owner') return defaults;
  const mine = decided.get(role);
  return new Set(
    permissions.map((p) => p.name).filter((name) => mine?.get(name) ?? defaults.has(name)),
  );
}
