import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/**
 * Who may change the catalogue. Checked on the server for every surface; the business roles are
 * the defaults until the owner ticks otherwise.
 */
export const catalogPermissions: BusinessPermission[] = [
  {
    name: 'catalog:manage',
    label: words(m.perm_catalog_manage),
    description: words(m.perm_catalog_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
];
