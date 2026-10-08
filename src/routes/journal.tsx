import { AuditLog } from '@kete/admin/ui';
import { EmptyState } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { fetchJournal } from '@/lib/journal';
import * as m from '@/paraglide/messages.js';
import { getLocale } from '@/paraglide/runtime.js';

export const Route = createFileRoute('/_app/journal')({
  loader: () => fetchJournal(),
  component: JournalPage,
});

function JournalPage() {
  const journal = Route.useLoaderData();
  const format = new Intl.DateTimeFormat(getLocale(), { dateStyle: 'short', timeStyle: 'short' });
  return (
    <>
      {!journal ? (
        <EmptyState title={m.journal_empty()} />
      ) : (
        <AuditLog
          entries={journal.entries}
          labels={{
            title: m.journal_title(),
            when: m.journal_when(),
            who: m.journal_who(),
            what: m.journal_what(),
            channel: m.journal_channel(),
            onBehalfOf: (name) => m.journal_on_behalf_of({ name }),
            delegatedBy: (names) => m.journal_delegated_by({ names }),
            reversible: m.journal_reversible(),
            empty: m.journal_empty(),
          }}
          nameOf={(actor) =>
            actor.id === journal.me
              ? m.journal_you()
              : actor.kind === 'agent'
                ? m.journal_agent()
                : actor.id
          }
          formatDate={(date) => format.format(new Date(date))}
        />
      )}
    </>
  );
}
