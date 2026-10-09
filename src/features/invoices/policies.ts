import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** Who reads the invoices, who issues one, and who may cancel one with a credit note. */
export const invoicePermissions: BusinessPermission[] = [
  {
    name: 'invoices:read',
    label: words(m.perm_invoices_read),
    description: words(m.perm_invoices_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'accountant'],
  },
  {
    name: 'invoices:issue',
    label: words(m.perm_invoices_issue),
    description: words(m.perm_invoices_issue_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'accountant'],
  },
  {
    name: 'invoices:credit',
    label: words(m.perm_invoices_credit),
    description: words(m.perm_invoices_credit_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'accountant'],
  },
];
