import { definePermissions } from '@kete/capabilities';
// The policies are read at their file, not at the features' doors: the doors need this list.
import { accountPermissions } from '@/features/accounts/policies';
import { assistantPermissions } from '@/features/assistant/policies';
import { businessPermissions } from '@/features/business/policies';
import { catalogPermissions } from '@/features/catalog/policies';
import { customerPermissions } from '@/features/customers/policies';
import { deliveryPermissions } from '@/features/delivery/policies';
import { invoicePermissions } from '@/features/invoices/policies';
import { managerPermissions } from '@/features/manager/policies';
import { messagingPermissions } from '@/features/messaging/policies';
import { moneyPermissions } from '@/features/money/policies';
import { networkPermissions } from '@/features/network/policies';
import { orderPermissions } from '@/features/orders/policies';
import { teamPermissions } from '@/features/team/policies';

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
  ...messagingPermissions,
  ...assistantPermissions,
  ...teamPermissions,
  ...invoicePermissions,
  ...managerPermissions,
  ...accountPermissions,
  ...deliveryPermissions,
  ...networkPermissions,
];

export const permissions = definePermissions(businessPermissionList);
