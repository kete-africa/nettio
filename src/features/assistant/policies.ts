import type { BusinessPermission } from '@/features/business';
import { businessRoles } from '@/features/business/business.record';
import * as m from '@/paraglide/messages.js';
import { words } from '@/platform/words';

/**
 * Who may ask Nettio a question — everyone who works there: the answer only rests on the readings
 * the person may open herself — and who decides where the evening statement leaves to.
 */
export const assistantPermissions: BusinessPermission[] = [
  {
    name: 'assistant:ask',
    label: words(m.perm_assistant_ask),
    description: words(m.perm_assistant_ask_body),
    roles: ['owner', 'admin'],
    staff: businessRoles,
  },
  {
    // Whoever receives the statement reads the laundry's money: the owner's decision.
    name: 'statement:send',
    label: words(m.perm_statement_send),
    description: words(m.perm_statement_send_body),
    roles: ['owner', 'admin'],
    staff: ['owner'],
  },
];
