import type { TaskStatus } from '../task.record';

/** The rules of a task, pure: no database, no framework, tested alone. */
export class TaskRuleError extends Error {
  constructor(readonly code: 'already_done' | 'not_done' | 'not_found') {
    super(code);
    this.name = 'TaskRuleError';
  }
}

export function completed(status: TaskStatus): TaskStatus {
  if (status === 'done') throw new TaskRuleError('already_done');
  return 'done';
}

export function reopened(status: TaskStatus): TaskStatus {
  if (status === 'open') throw new TaskRuleError('not_done');
  return 'open';
}
