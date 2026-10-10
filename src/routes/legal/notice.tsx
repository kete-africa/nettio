import { createFileRoute } from '@tanstack/react-router';
import { PublicPage, PublisherFacts, Updated } from '@/lib/legal';
import { fetchPublisher } from '@/lib/publisher';
import * as m from '@/paraglide/messages.js';

// A public page (specs/030-standalone): read without signing in.
export const Route = createFileRoute('/mentions-legales')({
  loader: () => fetchPublisher(),
  component: Page,
});

function Page() {
  const publisher = Route.useLoaderData();
  return (
    <PublicPage title={m.legal_notice()}>
      <PublisherFacts publisher={publisher} />
      <p className="max-w-prose">{m.legal_notice_body()}</p>
      <Updated publisher={publisher} />
    </PublicPage>
  );
}
