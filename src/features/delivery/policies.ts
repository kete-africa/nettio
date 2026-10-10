import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** Who reads the trips, who plans them, and who makes them. */
export const deliveryPermissions: BusinessPermission[] = [
  {
    name: 'delivery:read',
    label: words(m.perm_delivery_read),
    description: words(m.perm_delivery_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'courier'],
  },
  {
    name: 'delivery:plan',
    label: words(m.perm_delivery_plan),
    description: words(m.perm_delivery_plan_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter'],
  },
  {
    name: 'delivery:run',
    label: words(m.perm_delivery_run),
    description: words(m.perm_delivery_run_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'courier'],
  },
];
