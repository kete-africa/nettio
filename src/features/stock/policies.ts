import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** Who reads the stock, who moves it, who decides what is kept, who orders, who pays a supplier. */
export const stockPermissions: BusinessPermission[] = [
  {
    name: 'stock:read',
    label: words(m.perm_stock_read),
    description: words(m.perm_stock_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'workshop', 'accountant'],
  },
  {
    name: 'stock:move',
    label: words(m.perm_stock_move),
    description: words(m.perm_stock_move_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'workshop'],
  },
  {
    name: 'stock:manage',
    label: words(m.perm_stock_manage),
    description: words(m.perm_stock_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'purchases:order',
    label: words(m.perm_purchases_order),
    description: words(m.perm_purchases_order_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'suppliers:pay',
    label: words(m.perm_suppliers_pay),
    description: words(m.perm_suppliers_pay_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
];
