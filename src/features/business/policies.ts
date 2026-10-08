import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';
import { businessRoles } from './business.record';
import type { BusinessPermission } from './domain/roles';

/**
 * Who may see and set the business. Checked on the server for every surface: a screen, the MCP
 * endpoint, an agent acting for a person. `staff` names the business roles that hold a permission
 * until the owner ticks otherwise (docs/product/referentiels.md).
 */
export const businessPermissions: BusinessPermission[] = [
  {
    name: 'business:read',
    label: words(m.perm_business_read),
    description: words(m.perm_business_read_body),
    roles: ['owner', 'admin'],
    staff: businessRoles,
  },
  {
    name: 'settings:manage',
    label: words(m.perm_settings_manage),
    description: words(m.perm_settings_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner'],
  },
  {
    name: 'staff:manage',
    label: words(m.perm_staff_manage),
    description: words(m.perm_staff_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner'],
  },
  // The organization's journal: who did what, agents included (@kete/admin).
  {
    name: 'journal:read',
    label: words(m.perm_journal_read),
    description: words(m.perm_journal_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'accountant'],
  },
];
