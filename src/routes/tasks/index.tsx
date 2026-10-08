import { Panel } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { addTask, fetchTasks } from '@/features/tasks/functions';
import { TaskForm } from '@/features/tasks/ui/TaskForm';
import { TaskList } from '@/features/tasks/ui/TaskList';
import { AppShell } from '@/lib/shell';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

export const Route = createFileRoute('/taches')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: () => fetchTasks(),
  component: TasksPage,
});

function TasksPage() {
  const tasks = Route.useLoaderData();
  const router = useRouter();
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <h1 className="font-heading text-headline font-semibold">{m.tasks_title()}</h1>
        <Panel>
          <TaskForm
            onAdd={async (task) => {
              await addTask({ data: task });
              await router.invalidate();
            }}
          />
        </Panel>
        <TaskList tasks={tasks} />
      </div>
    </AppShell>
  );
}
