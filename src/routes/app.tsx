import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';
import { AppShell } from '@/lib/shell';
import { requirePerson } from '@/lib/signed-in';

// The frame of every signed-in screen. A laundry that is not set up has one screen: its start.
export const Route = createFileRoute('/_app')({
  beforeLoad: async ({ location }) => {
    const { me } = await requirePerson(location.href);
    const starting = location.pathname === '/demarrage';
    if (!me.business && !starting) throw redirect({ to: '/demarrage' });
    if (me.business && starting) throw redirect({ to: '/aujourdhui' });
    return { me };
  },
  component: AppFrame,
});

function AppFrame() {
  const { me } = Route.useRouteContext();
  return (
    <AppShell me={me}>
      <Outlet />
    </AppShell>
  );
}
