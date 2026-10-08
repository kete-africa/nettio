import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** Who decides what the laundry writes to its customers, and who may read what was written. */
export const messagingPermissions: BusinessPermission[] = [
  {
    name: 'messages:read',
    label: words(m.perm_messages_read),
    description: words(m.perm_messages_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier'],
  },
  {
    name: 'messages:manage',
    label: words(m.perm_messages_manage),
    description: words(m.perm_messages_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
];
