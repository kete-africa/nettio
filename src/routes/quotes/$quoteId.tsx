import { Button, EmptyState, Tag } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { decideQuote, fetchQuote } from '@/features/accounts/functions';
import { quoteStateTones, quoteStateWords } from '@/features/accounts/ui/words';
import { fetchBusiness } from '@/features/business/functions';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note } from '@/lib/fields';
import { formatDay, formatMoney, formatNumber } from '@/lib/format';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// A quote stands outside the frame, like an invoice: only the document goes to the printer.
export const Route = createFileRoute('/devis/$quoteId')({
  beforeLoad: async ({ location }) => requirePerson(location.href),
  loader: async ({ params }) => {
    const [read, business] = await Promise.all([fetchQuote({ data: { quoteId: params.quoteId } }), fetchBusiness()]);
    return { read, business };
  },
  component: QuotePage,
});

function QuotePage() {
  const { me } = Route.useRouteContext();
  const { read, business } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!read) return <EmptyState title={m.error_not_found()} />;
  const { quote, state } = read;
  const mayWrite = me.permissions.includes('quotes:write');

  async function decide(accepted: boolean) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await decideQuote({ data: { quoteId: quote.quoteId, accepted } });
      if (outcome.ok) {
        await router.invalidate();
        setSaid(accepted ? m.quote_accepted_said() : m.quote_refused_said());
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-5 bg-canvas px-4 py-6 font-ui text-body text-fg">
      <article className="rounded-box border border-line bg-surface p-5 print:border-0 print:p-0">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <p className="font-heading text-title font-semibold">{business?.settings?.businessName ?? m.app_name()}</p>
          <div className="text-right">
            <h1 className="font-heading text-title font-semibold">{m.quote_title({ number: quote.number })}</h1>
            <p className="text-body-sm text-fg-muted">{formatDay(quote.createdAt)}</p>
            <p className="text-body-sm text-fg-muted">{m.quote_valid_until({ day: formatDay(quote.validUntil) })}</p>
            <p className="mt-1 print:hidden">
              <Tag tone={quoteStateTones[state]}>{quoteStateWords[state]()}</Tag>
            </p>
          </div>
        </header>
        <p className="text-body-sm text-fg-muted">{m.invoice_customer()}</p>
        <p className="mb-4 font-semibold">{quote.customerName}</p>
        <ul className="border-y border-line py-2">
          {quote.lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a written quote never move
            <li key={index} className="flex items-baseline justify-between gap-3 py-1">
              <span className="min-w-0">
                {line.pricing === 'per_kg' ? `${formatNumber(line.quantity, 3)} kg` : `${formatNumber(line.quantity)} ×`}{' '}
                {line.articleName ? `${line.articleName} · ${line.serviceName}` : line.serviceName}
                <span className="block text-body-sm text-fg-muted">
                  {m.quote_unit_price({ amount: formatMoney(line.unitPrice) })}
                </span>
              </span>
              <span className="font-number whitespace-nowrap">{formatMoney(line.amount)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex items-baseline justify-between gap-3 font-semibold">
          <span>{m.order_total()}</span>
          <span className="font-number">{formatMoney(quote.total)}</span>
        </p>
        {quote.note && <p className="mt-4 whitespace-pre-line text-body-sm">{quote.note}</p>}
        <p className="mt-4 text-body-sm text-fg-muted">{m.quote_footer()}</p>
      </article>

      <div className="flex flex-col gap-3 print:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap gap-3">
          {mayWrite && state === 'open' && (
            <>
              <Button disabled={busy} onClick={() => void decide(true)}>
                {m.quote_accept()}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => void decide(false)}>
                {m.quote_refuse()}
              </Button>
            </>
          )}
          <Button variant="secondary" onClick={() => window.print()}>
            {m.quote_print()}
          </Button>
          <a className="inline-flex h-(--control-height) items-center font-semibold text-fg-link underline" href="/devis">
            {m.quotes_all()}
          </a>
        </div>
      </div>
    </main>
  );
}
