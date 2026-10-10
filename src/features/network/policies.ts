import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** Who reads what travels between the sites, who sends a slip, who receives one. */
export const networkPermissions: BusinessPermission[] = [
  {
    name: 'transfers:read',
    label: words(m.perm_transfers_read),
    description: words(m.perm_transfers_read_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier', 'workshop', 'courier'],
  },
  {
    name: 'transfers:send',
    label: words(m.perm_transfers_send),
    description: words(m.perm_transfers_send_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'workshop', 'courier'],
  },
  {
    name: 'transfers:receive',
    label: words(m.perm_transfers_receive),
    description: words(m.perm_transfers_receive_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'workshop'],
  },
];
