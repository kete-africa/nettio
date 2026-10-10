import { createFileRoute } from '@tanstack/react-router';
import { PublicPage, PublisherFacts, Section, Updated } from '@/lib/legal';
import { fetchPublisher } from '@/lib/publisher';
import * as m from '@/paraglide/messages.js';

// A public page (specs/030-standalone): read without signing in.
export const Route = createFileRoute('/confidentialite')({
  loader: () => fetchPublisher(),
  component: Page,
});

function Page() {
  const publisher = Route.useLoaderData();
  return (
    <PublicPage title={m.legal_privacy()}>
      <Section title={m.privacy_who_title()}>{m.privacy_who_body()}</Section>
      <Section title={m.privacy_what_title()}>{m.privacy_what_body()}</Section>
      <Section title={m.privacy_why_title()}>{m.privacy_why_body()}</Section>
      <Section title={m.privacy_messages_title()}>{m.privacy_messages_body()}</Section>
      <Section title={m.privacy_ai_title()}>{m.privacy_ai_body()}</Section>
      <Section title={m.privacy_where_title()}>{m.privacy_where_body()}</Section>
      <Section title={m.privacy_rights_title()}>{m.privacy_rights_body()}</Section>
      <PublisherFacts publisher={publisher} />
      <Updated publisher={publisher} />
    </PublicPage>
  );
}
