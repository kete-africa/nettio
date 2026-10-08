import { z } from 'zod';

/**
 * The business events of tasks (kete-core spec 049): what the center may react to — an agent, a
 * morning briefing, a notification. Identifiers and facts only; the manifest lists them (`emits`).
 */
export const taskEvents = [
  {
    type: 'task.created',
    description: 'A task was added: its id and its due day.',
    classification: 'internal',
    data: z.object({ taskId: z.string(), dueOn: z.string().nullable() }),
  },
  {
    type: 'task.completed',
    description: 'A task was done: its id.',
    classification: 'internal',
    data: z.object({ taskId: z.string() }),
  },
] as const;
