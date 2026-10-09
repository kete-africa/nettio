import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** Who reads a customer's account, who agrees terms and prices, who takes money ahead, who quotes. */
export const accountPermissions: BusinessPermission[] = [
  {
    name: 'accounts:read',
    label: words(m.perm_accounts_read),
    description: words(m.perm_accounts_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'accountant'],
  },
  {
    name: 'accounts:manage',
    label: words(m.perm_accounts_manage),
    description: words(m.perm_accounts_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'credit:top_up',
    label: words(m.perm_credit_top_up),
    description: words(m.perm_credit_top_up_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier'],
  },
  {
    name: 'quotes:read',
    label: words(m.perm_quotes_read),
    description: words(m.perm_quotes_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'accountant'],
  },
  {
    name: 'quotes:write',
    label: words(m.perm_quotes_write),
    description: words(m.perm_quotes_write_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter'],
  },
];
