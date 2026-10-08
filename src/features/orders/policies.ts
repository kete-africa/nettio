import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/**
 * Who may do what with deposits and their money (docs/product/referentiels.md). The sensitive
 * gestures — a discount above the ceiling, a cancellation, a refund, handing over unpaid — are
 * the manager's and the owner's until the owner ticks otherwise.
 */
export const orderPermissions: BusinessPermission[] = [
  {
    name: 'orders:read',
    label: words(m.perm_orders_read),
    description: words(m.perm_orders_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'workshop', 'courier', 'accountant'],
  },
  {
    name: 'orders:create',
    label: words(m.perm_orders_create),
    description: words(m.perm_orders_create_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter'],
  },
  {
    name: 'orders:cancel',
    label: words(m.perm_orders_cancel),
    description: words(m.perm_orders_cancel_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'orders:discount',
    label: words(m.perm_orders_discount),
    description: words(m.perm_orders_discount_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'orders:release_unpaid',
    label: words(m.perm_orders_release_unpaid),
    description: words(m.perm_orders_release_unpaid_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'payments:collect',
    label: words(m.perm_payments_collect),
    description: words(m.perm_payments_collect_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'cashier', 'courier'],
  },
  {
    name: 'payments:refund',
    label: words(m.perm_payments_refund),
    description: words(m.perm_payments_refund_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'workshop:operate',
    label: words(m.perm_workshop_operate),
    description: words(m.perm_workshop_operate_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'workshop'],
  },
];
