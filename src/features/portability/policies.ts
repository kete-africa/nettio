import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** The laundry's data as a whole leaves with its owner, and nobody else. */
export const portabilityPermissions: BusinessPermission[] = [
  {
    name: 'data:export',
    label: words(m.perm_data_export),
    description: words(m.perm_data_export_body),
    roles: ['owner', 'admin'],
    staff: ['owner'],
  },
];
