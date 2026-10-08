import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/**
 * Who reads the work and the pay of everyone, and who decides the piece rates. Each person reads
 * her own work with the workshop's right — nobody else's.
 */
export const teamPermissions: BusinessPermission[] = [
  {
    name: 'pay:read',
    label: words(m.perm_pay_read),
    description: words(m.perm_pay_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'accountant'],
  },
  {
    name: 'pay:manage',
    label: words(m.perm_pay_manage),
    description: words(m.perm_pay_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner'],
  },
];
