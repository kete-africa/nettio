import { definePermissions } from '@kete/capabilities';
// The policies are read at their file, not at the features' doors: the doors need this list.
import { businessPermissions } from '@/features/business/policies';
import { catalogPermissions } from '@/features/catalog/policies';

/**
 * Every permission Nettio checks, with its words, the Compte Kete roles that hold it by the
 * chassis contract, and the business roles that hold it until the owner ticks otherwise. Each
 * feature declares its own; the manifest describes them.
 */
export const businessPermissionList = [...businessPermissions, ...catalogPermissions];

export const permissions = definePermissions(businessPermissionList);
