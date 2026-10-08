import { definePermissions } from '@kete/capabilities';
// The policies are read at their file, not at the features' doors: the doors need this list.
import { businessPermissions } from '@/features/business/policies';
import { catalogPermissions } from '@/features/catalog/policies';
import { customerPermissions } from '@/features/customers/policies';
import { moneyPermissions } from '@/features/money/policies';
import { orderPermissions } from '@/features/orders/policies';

/**
 * Every permission Nettio checks, with its words, the Compte Kete roles that hold it by the
 * chassis contract, and the business roles that hold it until the owner ticks otherwise. Each
 * feature declares its own; the manifest describes them.
 */
export const businessPermissionList = [
  ...businessPermissions,
  ...catalogPermissions,
  ...customerPermissions,
  ...orderPermissions,
  ...moneyPermissions,
];

export const permissions = definePermissions(businessPermissionList);
