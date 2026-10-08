import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** Who may see the laundry's customers, and who may add or change them. */
export const customerPermissions: BusinessPermission[] = [
  {
    name: 'customers:read',
    label: words(m.perm_customers_read),
    description: words(m.perm_customers_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'courier', 'accountant'],
  },
  {
    name: 'customers:write',
    label: words(m.perm_customers_write),
    description: words(m.perm_customers_write_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier'],
  },
];
