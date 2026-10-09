import { EmptyState, PageHeader } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { fetchManager } from '@/features/manager/functions';
import { Approvals, Complaints, Schedule, Unclaimed } from '@/features/manager/ui/ManagerBoard';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// What lets a site run without its owner (specs/025-manager): what was asked of a manager, the
// customers' complaints, the deposits nobody comes back for, and who is expected when. Each part
// shows only to who may read it.
export const Route = createFileRoute('/_app/pressing/gerant')({
  loader: async () => ({ view: await fetchManager() }),
  component: ManagerPage,
});

function ManagerPage() {
  const { me } = Route.useRouteContext();
  const { view } = Route.useLoaderData();
  const parts = [view.approvals, view.complaints, view.unclaimed, view.schedule];
  if (parts.every((part) => part === null)) return <EmptyState title={m.error_not_allowed()} />;
  const firstOf = (index: number) => parts.slice(0, index).every((part) => part === null);
  return (
    <>
      <PageHeader title={m.manager_title()} description={m.manager_description()} />
      {view.approvals && <Approvals view={view.approvals} first={firstOf(0)} />}
      {view.complaints && (
        <Complaints complaints={view.complaints} mayResolve={can(me, 'complaints:resolve')} first={firstOf(1)} />
      )}
      {view.unclaimed && (
        <Unclaimed view={view.unclaimed} mayRule={can(me, 'settings:manage')} first={firstOf(2)} />
      )}
      {view.schedule && (
        <Schedule view={view.schedule} mayPlan={can(me, 'schedule:manage')} first={firstOf(3)} />
      )}
    </>
  );
}
