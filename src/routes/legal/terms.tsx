import { createFileRoute } from '@tanstack/react-router';
import { PublicPage, PublisherFacts, Section, Updated } from '@/lib/legal';
import { fetchPublisher } from '@/lib/publisher';
import * as m from '@/paraglide/messages.js';

// A public page (specs/030-standalone): read without signing in.
export const Route = createFileRoute('/conditions')({
  loader: () => fetchPublisher(),
  component: Page,
});

function Page() {
  const publisher = Route.useLoaderData();
  return (
    <PublicPage title={m.legal_terms()}>
      <Section title={m.terms_use_title()}>{m.terms_use_body()}</Section>
      <Section title={m.terms_yours_title()}>{m.terms_yours_body()}</Section>
      <Section title={m.terms_account_title()}>{m.terms_account_body()}</Section>
      <Section title={m.terms_data_title()}>{m.terms_data_body()}</Section>
      <Section title={m.terms_change_title()}>{m.terms_change_body()}</Section>
      <PublisherFacts publisher={publisher} />
      <Updated publisher={publisher} />
    </PublicPage>
  );
}
