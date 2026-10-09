import type { BusinessPermission } from '@/features/business';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/** What lets a site run without its owner: who plans, who asks, who decides, who closes. */
export const managerPermissions: BusinessPermission[] = [
  {
    name: 'schedule:manage',
    label: words(m.perm_schedule_manage),
    description: words(m.perm_schedule_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'approvals:request',
    label: words(m.perm_approvals_request),
    description: words(m.perm_approvals_request_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier'],
  },
  {
    name: 'approvals:decide',
    label: words(m.perm_approvals_decide),
    description: words(m.perm_approvals_decide_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'complaints:open',
    label: words(m.perm_complaints_open),
    description: words(m.perm_complaints_open_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager', 'counter', 'cashier'],
  },
  {
    name: 'complaints:resolve',
    label: words(m.perm_complaints_resolve),
    description: words(m.perm_complaints_resolve_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
  {
    name: 'unclaimed:manage',
    label: words(m.perm_unclaimed_manage),
    description: words(m.perm_unclaimed_manage_body),
    roles: ['owner', 'admin'],
    staff: ['owner', 'manager'],
  },
];
