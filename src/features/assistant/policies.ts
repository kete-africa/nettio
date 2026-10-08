import type { BusinessPermission } from '@/features/business';
import { businessRoles } from '@/features/business/business.record';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/**
 * Who may ask Nettio a question. Everyone who works there: the answer only rests on the readings
 * the person may open herself.
 */
export const assistantPermissions: BusinessPermission[] = [
  {
    name: 'assistant:ask',
    label: words(m.perm_assistant_ask),
    description: words(m.perm_assistant_ask_body),
    roles: ['owner', 'admin'],
    staff: businessRoles,
  },
];
