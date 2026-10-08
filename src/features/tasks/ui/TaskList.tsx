import { EmptyState, Tag } from '@kete/design';
import { Link } from '@tanstack/react-router';
import * as m from '@/paraglide/messages.js';
import type { Task } from '../task.record';

/** The organization's tasks: what is left to do first, then what is done. */
export function TaskList({ tasks }: { tasks: Task[] }) {
  if (tasks.length === 0) {
    return <EmptyState title={m.tasks_empty_title()}>{m.tasks_empty_body()}</EmptyState>;
  }
  return (
    <ul className="divide-y divide-line rounded-box border border-line bg-surface">
      {tasks.map((task) => (
        <li key={task.taskId}>
          <Link
            to="/taches/$taskId"
            params={{ taskId: task.taskId }}
            className="flex min-h-12 items-center justify-between gap-4 px-4 py-3 text-fg hover:bg-surface-hover"
          >
            <span className="min-w-0">
              <span className="block truncate font-semibold">{task.title}</span>
              {task.dueOn && (
                <span className="font-number text-body-sm text-fg-muted">{task.dueOn}</span>
              )}
            </span>
            <Tag tone={task.status === 'done' ? 'validated' : 'neutral'}>
              {task.status === 'done' ? m.task_done() : m.task_open()}
            </Tag>
          </Link>
        </li>
      ))}
    </ul>
  );
}
