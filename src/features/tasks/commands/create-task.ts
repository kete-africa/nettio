import { defineCommand } from '@kete/commands';
import { announce } from '@/platform/announce';
import { insertTask } from '../infrastructure/task.table';
import { taskInput } from '../task.record';

/** Adds a task: the same command for a screen, an agent's validated draft and the API. */
export const createTask = defineCommand({
  name: 'create-task',
  input: taskInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const task = await insertTask(db, {
      organizationId,
      title: input.title,
      dueOn: input.dueOn,
      createdBy: actor.id,
    });
    // The center hears of it with the change (kete-core spec 049).
    await announce(db, {
      type: 'task.created',
      organization: organizationId,
      data: { taskId: task.taskId, dueOn: task.dueOn },
    });
    return task;
  },
  summarize: (input) => `Task "${input.title}" added`,
});
