import { Button, Chip, ChipGroup, EmptyState, Markdown, PageHeader, PageSection } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { askQuestion, fetchAsking } from '@/features/assistant/functions';
import { sourceWords } from '@/features/assistant/ui/words';
import { ErrorNote, TextAreaField } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';

// « Demander » (specs/007-intelligence): a question in plain words. The answer rests only on the
// readings the person may open herself, computed by code, and says where it comes from.
export const Route = createFileRoute('/_app/demander')({
  loader: () => fetchAsking(),
  component: AskPage,
});

interface Exchange {
  question: string;
  answer: string;
  sources: string[];
}

function AskPage() {
  const asking = Route.useLoaderData();
  const [question, setQuestion] = useState('');
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!asking.allowed) return <EmptyState title={m.error_not_allowed()} />;
  if (!asking.connected) {
    return (
      <>
        <PageHeader title={m.nav_ask()} description={m.ask_description()} />
        <EmptyState title={m.ask_not_connected_title()}>{m.ask_not_connected_body()}</EmptyState>
      </>
    );
  }

  async function submit(text: string) {
    const asked = text.trim();
    if (asked.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await askQuestion({ data: { question: asked } });
      if (outcome.available) {
        setExchanges((current) => [
          { question: asked, answer: outcome.answer, sources: outcome.sources },
          ...current,
        ]);
        setQuestion('');
      } else {
        setError(
          outcome.reason === 'budget_spent' ? m.ask_budget_spent() : m.ask_not_connected_body(),
        );
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const suggestions = [m.ask_suggestion_month(), m.ask_suggestion_packs(), m.ask_suggestion_today(), m.ask_suggestion_late()];
  return (
    <>
      <PageHeader title={m.nav_ask()} description={m.ask_description()} />
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(question);
        }}
      >
        <TextAreaField
          label={m.ask_question()}
          value={question}
          rows={3}
          maxLength={500}
          disabled={busy}
          onChange={setQuestion}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ChipGroup label={m.ask_suggestions()}>
            {suggestions.map((suggestion) => (
              <Chip key={suggestion} pressed={false} disabled={busy} onClick={() => void submit(suggestion)}>
                {suggestion}
              </Chip>
            ))}
          </ChipGroup>
          <Button type="submit" disabled={busy || question.trim().length < 2}>
            {busy ? m.ask_thinking() : m.ask_submit()}
          </Button>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </form>

      {exchanges.length > 0 && (
        <PageSection title={m.ask_answers()}>
          <ul className="flex flex-col gap-4" aria-live="polite">
            {exchanges.map((exchange, index) => (
              <li key={exchanges.length - index} className="rounded-box border border-line bg-surface p-4">
                <p className="mb-2 font-semibold">{exchange.question}</p>
                <Markdown text={exchange.answer} />
                <p className="mt-3 text-body-sm text-fg-muted">
                  {exchange.sources.length > 0
                    ? m.ask_sources({
                        sources: exchange.sources
                          .map((source) => (sourceWords[source] ?? (() => source))())
                          .join(' · '),
                      })
                    : m.ask_no_source()}
                </p>
              </li>
            ))}
          </ul>
        </PageSection>
      )}
      <p className="mt-6 max-w-3xl text-body-sm text-fg-muted">{m.ask_how()}</p>
    </>
  );
}
