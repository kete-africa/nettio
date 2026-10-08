import { definePermissions } from '@kete/capabilities';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/**
 * Who may do what with tasks. Checked on the server for every surface: a screen, the MCP endpoint,
 * an agent acting for a person. The roles are the defaults; once the organization manages the
 * app's rights in Kete Enterprise, its grants decide (kete-core spec 049).
 */
export const taskPermissions = definePermissions([
  {
    name: 'tasks:read',
    label: words(m.perm_tasks_read),
    description: words(m.perm_tasks_read_body),
    roles: ['owner', 'admin', 'member'],
  },
  {
    name: 'tasks:write',
    label: words(m.perm_tasks_write),
    description: words(m.perm_tasks_write_body),
    roles: ['owner', 'admin', 'member'],
  },
  {
    name: 'tasks:create',
    label: words(m.perm_tasks_create),
    description: words(m.perm_tasks_create_body),
    roles: ['owner', 'admin'],
  },
]);
