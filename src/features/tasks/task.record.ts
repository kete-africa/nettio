import { defineRecord, field } from '@kete/records';
import { z } from 'zod';

/**
 * A task, described once (CONCEPTION A.1): the form, the server's validation, the MCP tool's
 * input and the drafts come from this schema. Labels are translation keys.
 */
export const taskInput = z.object({
  title: field(z.string().trim().min(1).max(200), { label: 'task_title_label' }),
  dueOn: field(z.iso.date().optional(), { label: 'task_due_label' }),
});

export const taskRecord = defineRecord({
  type: 'task',
  prefix: 'tsk',
  schema: taskInput,
  summarize: (task) => (task.dueOn ? `${task.title} (${task.dueOn})` : task.title),
});

export type TaskStatus = 'open' | 'done';

export interface Task {
  taskId: string;
  title: string;
  dueOn: string | null;
  status: TaskStatus;
  createdAt: Date;
}
