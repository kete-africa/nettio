import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/**
 * Who may hold a till, write what goes out, and read what the laundry earns
 * (docs/product/referentiels.md). Costs and margins are the owner's and his accountant's.
 */
export const moneyPermissions: BusinessPermission[] = [
  {
    name: 'cash:operate',
    label: words(m.perm_cash_operate),
    description: words(m.perm_cash_operate_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'cashier', 'courier'],
  },
  {
    name: 'expenses:read',
    label: words(m.perm_expenses_read),
    description: words(m.perm_expenses_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'cashier', 'accountant'],
  },
  {
    name: 'expenses:write',
    label: words(m.perm_expenses_write),
    description: words(m.perm_expenses_write_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'cashier'],
  },
  {
    name: 'draws:record',
    label: words(m.perm_draws_record),
    description: words(m.perm_draws_record_body),
    roles: ['owner', 'admin'],
    staff: ['owner'],
  },
  {
    name: 'money:read',
    label: words(m.perm_money_read),
    description: words(m.perm_money_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'accountant'],
  },
  {
    name: 'costs:manage',
    label: words(m.perm_costs_manage),
    description: words(m.perm_costs_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner'],
  },
];
