import { Button, EmptyState, Panel, Tag } from '@kete/design';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { fetchTask, setTaskDone } from '@/features/tasks/functions';
import { AppShell } from '@/lib/shell';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/taches/$taskId')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: ({ params }) => fetchTask({ data: { taskId: params.taskId } }),
  component: TaskPage,
});

function TaskPage() {
  const task = Route.useLoaderData();
  const router = useRouter();
  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <Link to="/taches" className="text-body-sm text-link underline">
          {m.task_back()}
        </Link>
        {!task ? (
          <EmptyState title={m.task_not_found()} />
        ) : (
          <Panel>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h1 className="font-heading text-title font-semibold">{task.title}</h1>
                <Tag tone={task.status === 'done' ? 'validated' : 'neutral'}>
                  {task.status === 'done' ? m.task_done() : m.task_open()}
                </Tag>
              </div>
              {task.dueOn && <p className="font-number text-fg-muted">{task.dueOn}</p>}
              <div>
                <Button
                  variant={task.status === 'done' ? 'secondary' : 'primary'}
                  onClick={async () => {
                    await setTaskDone({
                      data: { taskId: task.taskId, done: task.status !== 'done' },
                    });
                    await router.invalidate();
                  }}
                >
                  {task.status === 'done' ? m.task_reopen() : m.task_complete()}
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </AppShell>
  );
}
