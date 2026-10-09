import { PageHeader } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { AssistantThread } from '@/features/assistant/ui/Assistant';
import { MessagingLink } from '@/features/assistant/ui/MessagingLink';
import * as m from '@/paraglide/messages.js';

// « Demander » as a page (specs/007-intelligence, 020-assistant): the same conversation as the
// panel that opens from every screen — kept while the person moves in the app.
export const Route = createFileRoute('/_app/demander')({
  component: AskPage,
});

function AskPage() {
  const { me } = Route.useRouteContext();
  return (
    <div className="flex min-h-[70dvh] max-w-3xl flex-col">
      <PageHeader title={m.nav_ask()} description={m.ask_description()} />
      <AssistantThread permissions={me.permissions} />
      <MessagingLink />
    </div>
  );
}
