import { Button, EmptyState, PageHeader, PageSection, Row, RowList, Tag, TextField } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { withCustomerPrices } from '@/features/accounts/domain/accounts';
import { fetchCounterAccount, fetchQuotes, writeQuote } from '@/features/accounts/functions';
import { quoteStateTones, quoteStateWords } from '@/features/accounts/ui/words';
import { priceOf } from '@/features/catalog/domain/catalog';
import { fetchCatalog } from '@/features/catalog/functions';
import { fetchCustomer, fetchCustomers } from '@/features/customers/functions';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, SelectField, TextAreaField } from '@/lib/fields';
import { formatDay, formatMoney } from '@/lib/format';
import * as m from '@/paraglide/messages.js';

const search = z.object({ client: z.string().max(64).optional() });

// Quotes (specs/026-accounts): what it would cost a customer, at her prices, before she decides.
export const Route = createFileRoute('/_app/devis')({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search: { client } }) => ({ client }),
  loader: async ({ deps }) => {
    const [list, catalog, customers, customer] = await Promise.all([
      fetchQuotes(),
      fetchCatalog(),
      fetchCustomers({ data: {} }),
      deps.client ? fetchCustomer({ data: { customerId: deps.client } }) : null,
    ]);
    const account = customer ? await fetchCounterAccount({ data: { customerId: customer.customerId } }) : null;
    return { list, catalog, customers, customer, account };
  },
  component: QuotesPage,
});

interface Line {
  serviceId: string;
  articleId: string;
  quantity: string;
}

function QuotesPage() {
  const { list, catalog, customers, customer, account } = Route.useLoaderData();
  const router = useRouter();
  const navigate = Route.useNavigate();
  const [lines, setLines] = useState<Line[]>([]);
  const [serviceId, setServiceId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [days, setDays] = useState('30');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!list) return <EmptyState title={m.error_not_allowed()} />;

  const services = (catalog?.services ?? []).filter((service) => service.active);
  const service = services.find((entry) => entry.serviceId === serviceId) ?? services[0];
  const articles = service?.pricing === 'per_piece' ? (catalog?.articles ?? []).filter((article) => article.active) : [];
  const chosenArticle = service?.pricing === 'per_piece' ? articleId || (articles[0]?.articleId ?? '') : '';
  const prices = withCustomerPrices(catalog?.prices ?? [], account?.prices ?? []);
  const said = (line: Line) => {
    const of = services.find((entry) => entry.serviceId === line.serviceId);
    const article = catalog?.articles.find((entry) => entry.articleId === line.articleId);
    const unit = priceOf(prices, line.serviceId, line.articleId || null);
    const amount = unit === undefined ? null : Math.round(unit * Number(line.quantity));
    return {
      label: `${line.quantity}${of?.pricing === 'per_kg' ? ' kg' : ' ×'} ${article ? `${article.name} · ${of?.name ?? ''}` : (of?.name ?? '')}`,
      amount,
    };
  };
  const total = lines.reduce((sum, line) => sum + (said(line).amount ?? 0), 0);
  const quantityOk = Number(quantity) > 0;

  async function save() {
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await writeQuote({
        data: {
          customerId: customer.customerId,
          lines: lines.map((line) => ({
            serviceId: line.serviceId,
            articleId: line.articleId || null,
            quantity: Number(line.quantity),
          })),
          validDays: Number(days) || 30,
          note,
        },
      });
      if (outcome.ok) {
        await router.invalidate();
        await router.navigate({ to: '/devis/$quoteId', params: { quoteId: outcome.output.quoteId } });
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
    <>
      <PageHeader title={m.nav_quotes()} description={m.quotes_description()} />
      {list.mayWrite && (
        <PageSection first title={m.quote_new()}>
          <div className="flex max-w-xl flex-col gap-4">
            <SelectField
              label={m.quote_customer()}
              value={customer?.customerId ?? ''}
              onChange={(event) => {
                setLines([]);
                void navigate({ search: event.target.value ? { client: event.target.value } : {} });
              }}
              options={[
                { value: '', label: m.quote_choose_customer() },
                ...(customers ?? []).map((entry) => ({ value: entry.customerId, label: entry.name })),
              ]}
            />
            {customer && services.length > 0 && (
              <>
                {account && account.prices.length > 0 && (
                  <p className="text-body-sm text-fg-muted">{m.counter_own_prices({ count: account.prices.length })}</p>
                )}
                <SelectField
                  label={m.own_price_service()}
                  value={service?.serviceId ?? ''}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    setArticleId('');
                  }}
                  options={services.map((entry) => ({ value: entry.serviceId, label: entry.name }))}
                />
                {articles.length > 0 && (
                  <SelectField
                    label={m.own_price_article()}
                    value={chosenArticle}
                    onChange={(event) => setArticleId(event.target.value)}
                    options={articles.map((article) => ({ value: article.articleId, label: article.name }))}
                  />
                )}
                <TextField
                  label={service?.pricing === 'per_kg' ? m.quote_kilos() : m.quote_pieces()}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
                <div>
                  <Button
                    variant="secondary"
                    disabled={!service || !quantityOk}
                    onClick={() => {
                      if (!service) return;
                      setLines((current) => [...current, { serviceId: service.serviceId, articleId: chosenArticle, quantity }]);
                      setQuantity('1');
                    }}
                  >
                    {m.quote_add_line()}
                  </Button>
                </div>
                {lines.length > 0 && (
                  <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
                    {lines.map((line, index) => {
                      const row = said(line);
                      return (
                        // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a quote being typed
                        <li key={index} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                          <span className="min-w-0">{row.label}</span>
                          <span className="flex items-center gap-3">
                            <span className="font-number">
                              {row.amount === null ? m.quote_not_sold() : formatMoney(row.amount)}
                            </span>
                            <Button
                              variant="secondary"
                              onClick={() => setLines((current) => current.filter((_, at) => at !== index))}
                            >
                              {m.quote_remove_line({ line: row.label })}
                            </Button>
                          </span>
                        </li>
                      );
                    })}
                    <li className="flex items-baseline justify-between gap-3 px-4 py-3 font-semibold">
                      <span>{m.order_total()}</span>
                      <span className="font-number">{formatMoney(total)}</span>
                    </li>
                  </ul>
                )}
                <TextField
                  label={m.quote_valid_days()}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
                <TextAreaField label={m.counter_note()} value={note} rows={2} maxLength={500} onChange={setNote} />
                <ErrorNote>{error}</ErrorNote>
                <div>
                  <Button disabled={busy || lines.length === 0} onClick={() => void save()}>
                    {m.quote_save()}
                  </Button>
                </div>
              </>
            )}
          </div>
        </PageSection>
      )}
      <PageSection first={!list.mayWrite} title={m.quotes_all()}>
        {list.quotes.length === 0 ? (
          <p className="text-fg-muted">{m.quotes_none()}</p>
        ) : (
          <RowList label={m.nav_quotes()}>
            {list.quotes.map((quote) => (
              <Row
                key={quote.quoteId}
                href={`/devis/${quote.quoteId}`}
                title={`${quote.number} · ${quote.customerName}`}
                meta={m.quote_valid_until({ day: formatDay(quote.validUntil) })}
                end={
                  <>
                    <span className="font-number">{formatMoney(quote.total)}</span>
                    <Tag tone={quoteStateTones[quote.state]}>{quoteStateWords[quote.state]()}</Tag>
                  </>
                }
              />
            ))}
          </RowList>
        )}
      </PageSection>
    </>
  );
}
