import { defineCapability } from '@kete/capabilities';
import { exposeRecord } from '@kete/views';
import { z } from 'zod';
import * as m from '@/paraglide/messages.js';
import { completeTask } from './commands/complete-task';
import { createTask } from './commands/create-task';
import { findTask, searchTasks } from './infrastructure/task.table';
import { taskInput, taskRecord, type Task } from './task.record';

/** What agents may do with tasks — through MCP, the chat or another app — and how far alone. */
export const taskCapabilities = [
  // Level 1, by the integration contract (kete-core spec 045): `task_list` and `task_get`, a table
  // and a record a copilot shows, under the read permission — no integration code to write.
  ...exposeRecord<Task>({
    type: 'task',
    description: 'the tasks of the organization, open ones first, soonest first',
    permission: 'tasks:read',
    title: m.tasks_table_title,
    empty: m.tasks_table_empty,
    columns: [
      { key: 'title', label: m.task_title_label, value: (t) => t.title },
      { key: 'dueOn', label: m.task_due_label, value: (t) => t.dueOn },
      { key: 'status', label: m.task_status_label, value: (t) => t.status },
    ],
    list: (db, query) => searchTasks(db, query),
    get: (db, id) => findTask(db, id),
    label: (t) => t.title,
  }),
  // Level 2: reversible; the agent acts, the person is told and may undo.
  defineCapability({
    name: 'tasks_complete',
    description: 'Marks a task done. It can be reopened.',
    permission: 'tasks:write',
    autonomy: 2,
    input: z.object({ taskId: z.string().min(1).max(64) }),
    command: completeTask,
  }),
  // Level 3: commits; the agent prepares a draft, a person validates it — in her copilot's view.
  defineCapability({
    name: 'tasks_create',
    description: 'Adds a task to the organization.',
    permission: 'tasks:create',
    autonomy: 3,
    input: taskInput,
    command: createTask,
    draft: { recordType: 'task', definition: taskRecord },
  }),
];
