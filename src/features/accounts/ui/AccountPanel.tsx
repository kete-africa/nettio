import { Button, PageSection, Tag, TextField } from '@kete/design';
import { Link } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import type { Catalog } from '@/features/catalog';
import type { PaymentMethod } from '@/features/orders';
import { gestureKey, MoneyFields, wholeAmount } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote, Note, SelectField, TextAreaField } from '@/lib/fields';
import { formatDay, formatMoney, formatMonth } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { AccountView } from '../capabilities';
import {
  cashSubscription,
  endSubscription,
  fetchAccount,
  saveCustomerPrice,
  saveTerms,
  startSubscription,
  topUp,
} from '../functions';
import { creditWords, quoteStateTones, quoteStateWords } from './words';

type Result = { ok: boolean; code?: string };
const box = 'rounded-box border border-line bg-surface p-4';

/**
 * A customer's account on her page (specs/026-accounts): the credit she paid ahead, her
 * subscriptions, her own prices, what the laundry agreed with her company, her quotes.
 */
export function AccountPanel({
  customerId,
  catalog,
  may,
}: {
  customerId: string;
  catalog: Catalog | null;
  may: { manage: boolean; topUp: boolean; quote: boolean };
}) {
  const [account, setAccount] = useState<AccountView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [form, setForm] = useState<'top_up' | 'subscription' | 'price' | 'terms' | null>(null);
  const [cashing, setCashing] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [credit, setCredit] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [name, setName] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [articleId, setArticleId] = useState('');
  const [terms, setTerms] = useState({ legalName: '', taxId: '', address: '', monthlyInvoice: false, paymentDays: '' });
  const [key, setKey] = useState(() => gestureKey('acc'));

  const read = useCallback(async () => {
    setAccount(await fetchAccount({ data: { customerId } }));
  }, [customerId]);
  useEffect(() => {
    void read();
  }, [read]);

  if (!account) return null;

  async function run(work: () => Promise<Result>, done: string) {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (!outcome.ok) return setError(errorSentence(outcome.code ?? ''));
      await read();
      setForm(null);
      setCashing(null);
      setAmount('');
      setCredit('');
      setName('');
      setKey(gestureKey('acc'));
      setSaid(done);
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const open = (next: NonNullable<typeof form>) => {
    setError(null);
    setSaid(null);
    setForm(next);
    if (next === 'terms' && account) {
      setTerms({ ...account.terms, paymentDays: account.terms.paymentDays === null ? '' : String(account.terms.paymentDays) });
    }
    if (next === 'price') {
      setServiceId(catalog?.services.find((service) => service.active)?.serviceId ?? '');
      setArticleId('');
      setAmount('');
    }
  };
  const cashed = wholeAmount(amount);
  const given = credit.trim() === '' ? cashed : wholeAmount(credit);
  const service = catalog?.services.find((entry) => entry.serviceId === serviceId);
  const articles = service?.pricing === 'per_piece' ? (catalog?.articles ?? []).filter((article) => article.active) : [];
  const pricedArticle = service?.pricing === 'per_piece' ? articleId || (articles[0]?.articleId ?? '') : '';
  const cancel = (
    <Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>
      {m.action_cancel()}
    </Button>
  );

  return (
    <>
      <PageSection title={m.credit_title()}>
        <div className="mb-3 flex flex-col gap-3 empty:hidden" aria-live="polite">
          {said && <Note>{said}</Note>}
          <ErrorNote>{error}</ErrorNote>
        </div>
        <p>
          <span className="text-fg-muted">{m.credit_balance()}</span>{' '}
          <span className="font-number font-semibold">{formatMoney(account.credit.balance)}</span>
        </p>
        {may.topUp && form !== 'top_up' && (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => open('top_up')}>
              {m.credit_top_up()}
            </Button>
          </div>
        )}
        {form === 'top_up' && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <MoneyFields amount={amount} method={method} hint={m.credit_cashed_hint()} onAmount={setAmount} onMethod={setMethod} />
            <TextField
              label={m.credit_given()}
              hint={m.credit_given_hint()}
              type="number"
              inputMode="numeric"
              min={1}
              value={credit}
              onChange={(event) => setCredit(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || cashed === null || given === null}
                onClick={() =>
                  void run(
                    () =>
                      topUp({
                        data: { key, topUp: { customerId, cashed: cashed ?? 0, credit: given ?? cashed ?? 0, method } },
                      }),
                    m.credit_topped_up({ amount: formatMoney(given ?? 0) }),
                  )
                }
              >
                {m.credit_top_up_confirm()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
        {account.credit.entries.length > 0 && (
          <ul className="mt-4 flex flex-col gap-1.5 text-body-sm">
            {account.credit.entries.slice(0, 12).map((entry) => (
              <li key={entry.entryId} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span>
                  <span className="font-number text-fg-muted">{formatDay(entry.createdAt)}</span>{' '}
                  {creditWords(entry)}
                </span>
                <span className="font-number">
                  {entry.kind === 'spend' ? '− ' : '+ '}
                  {formatMoney(entry.amount)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </PageSection>

      <PageSection title={m.subscriptions_title()}>
        {account.subscriptions.length === 0 ? (
          <p className="text-fg-muted">{m.subscriptions_none()}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {account.subscriptions.map((subscription) => (
              <li key={subscription.subscriptionId} className={box}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                  <span className="font-semibold">{subscription.name}</span>
                  {subscription.running ? (
                    <Tag tone={subscription.cashed ? 'validated' : 'error'}>
                      {subscription.cashed
                        ? m.subscription_cashed({ month: formatMonth(account.period) })
                        : m.subscription_due({ month: formatMonth(account.period) })}
                    </Tag>
                  ) : (
                    <Tag tone="neutral">{m.subscription_ended()}</Tag>
                  )}
                </div>
                <p className="text-body-sm text-fg-muted">
                  {m.subscription_terms({ amount: formatMoney(subscription.amount), credit: formatMoney(subscription.credit) })}
                </p>
                {subscription.running && cashing !== subscription.subscriptionId && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    {may.topUp && !subscription.cashed && (
                      <Button disabled={busy} onClick={() => setCashing(subscription.subscriptionId)}>
                        {m.subscription_cash({ amount: formatMoney(subscription.amount) })}
                      </Button>
                    )}
                    {may.manage && (
                      <Button
                        variant="secondary"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => endSubscription({ data: { subscriptionId: subscription.subscriptionId } }),
                            m.subscription_ended_said({ name: subscription.name }),
                          )
                        }
                      >
                        {m.subscription_end()}
                      </Button>
                    )}
                  </div>
                )}
                {cashing === subscription.subscriptionId && (
                  <div className="mt-3 flex max-w-xl flex-col gap-4">
                    <SelectField
                      label={m.money_method()}
                      value={method}
                      onChange={(event) => setMethod(event.target.value as PaymentMethod)}
                      options={(['cash', 'mobile_money', 'card', 'transfer'] as const).map((value) => ({
                        value,
                        label: creditWords({ kind: 'top_up', method: value, orderNumber: null, subscriptionName: null, period: null }, true),
                      }))}
                    />
                    <div className="flex flex-wrap gap-3">
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () => cashSubscription({ data: { key, month: { subscriptionId: subscription.subscriptionId, method } } }),
                            m.subscription_cashed_said({ name: subscription.name, credit: formatMoney(subscription.credit) }),
                          )
                        }
                      >
                        {m.subscription_cash({ amount: formatMoney(subscription.amount) })}
                      </Button>
                      <Button variant="secondary" disabled={busy} onClick={() => setCashing(null)}>
                        {m.action_cancel()}
                      </Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {may.manage && form !== 'subscription' && (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => open('subscription')}>
              {m.subscription_start()}
            </Button>
          </div>
        )}
        {form === 'subscription' && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <TextField label={m.subscription_name()} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
            <TextField
              label={m.subscription_amount()}
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <TextField
              label={m.subscription_credit()}
              hint={m.credit_given_hint()}
              type="number"
              inputMode="numeric"
              min={1}
              value={credit}
              onChange={(event) => setCredit(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || name.trim() === '' || cashed === null || given === null}
                onClick={() =>
                  void run(
                    () => startSubscription({ data: { customerId, name, amount: cashed ?? 0, credit: given ?? cashed ?? 0 } }),
                    m.subscription_started({ name }),
                  )
                }
              >
                {m.subscription_start()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
      </PageSection>

      <PageSection title={m.own_prices_title()}>
        <p className="mb-3 max-w-3xl text-body-sm text-fg-muted">{m.own_prices_hint()}</p>
        {account.prices.length === 0 ? (
          <p className="text-fg-muted">{m.own_prices_none()}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
            {account.prices.map((price) => (
              <li key={`${price.serviceId}|${price.articleId ?? ''}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="font-semibold">
                    {price.articleName ? `${price.articleName} · ${price.serviceName}` : price.serviceName}
                  </span>
                  <span className="block text-body-sm text-fg-muted">
                    {price.catalogue === null
                      ? m.own_price_no_catalogue()
                      : m.own_price_catalogue({ amount: formatMoney(price.catalogue) })}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <span className="font-number font-semibold">{formatMoney(price.amount)}</span>
                  {may.manage && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () =>
                            saveCustomerPrice({
                              data: { customerId, serviceId: price.serviceId, articleId: price.articleId, amount: null },
                            }),
                          m.own_price_removed(),
                        )
                      }
                    >
                      {m.own_price_remove({ name: price.articleName ?? price.serviceName })}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {may.manage && catalog && form !== 'price' && (
          <div className="mt-3">
            <Button variant="secondary" onClick={() => open('price')}>
              {m.own_price_add()}
            </Button>
          </div>
        )}
        {form === 'price' && catalog && (
          <div className="mt-3 flex max-w-xl flex-col gap-4">
            <SelectField
              label={m.own_price_service()}
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setArticleId('');
              }}
              options={catalog.services.filter((entry) => entry.active).map((entry) => ({ value: entry.serviceId, label: entry.name }))}
            />
            {articles.length > 0 && (
              <SelectField
                label={m.own_price_article()}
                value={pricedArticle}
                onChange={(event) => setArticleId(event.target.value)}
                options={articles.map((article) => ({ value: article.articleId, label: article.name }))}
              />
            )}
            <TextField
              label={m.own_price_amount()}
              type="number"
              inputMode="numeric"
              min={0}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || !serviceId || !/^\d+$/.test(amount.trim())}
                onClick={() =>
                  void run(
                    () =>
                      saveCustomerPrice({
                        data: { customerId, serviceId, articleId: pricedArticle || null, amount: Number(amount) },
                      }),
                    m.own_price_saved(),
                  )
                }
              >
                {m.own_price_save()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
      </PageSection>

      <PageSection title={m.terms_title()}>
        {form !== 'terms' ? (
          <>
            <p className="text-fg-muted">
              {account.terms.legalName || account.terms.monthlyInvoice
                ? [
                    account.terms.legalName,
                    account.terms.taxId && `NIF ${account.terms.taxId}`,
                    account.terms.monthlyInvoice ? m.terms_monthly_on() : '',
                    account.terms.paymentDays !== null ? m.terms_days({ days: account.terms.paymentDays }) : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')
                : m.terms_none()}
            </p>
            {may.manage && (
              <div className="mt-3">
                <Button variant="secondary" onClick={() => open('terms')}>
                  {m.terms_edit()}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="flex max-w-xl flex-col gap-4">
            <TextField
              label={m.terms_legal_name()}
              value={terms.legalName}
              maxLength={160}
              onChange={(event) => setTerms((current) => ({ ...current, legalName: event.target.value }))}
            />
            <TextField
              label={m.terms_tax_id()}
              value={terms.taxId}
              maxLength={60}
              onChange={(event) => setTerms((current) => ({ ...current, taxId: event.target.value }))}
            />
            <TextAreaField
              label={m.terms_address()}
              value={terms.address}
              rows={2}
              maxLength={300}
              onChange={(address) => setTerms((current) => ({ ...current, address }))}
            />
            <CheckField
              label={m.terms_monthly()}
              hint={m.terms_monthly_hint()}
              checked={terms.monthlyInvoice}
              onChange={(monthlyInvoice) => setTerms((current) => ({ ...current, monthlyInvoice }))}
            />
            <TextField
              label={m.terms_payment_days()}
              hint={m.terms_payment_days_hint()}
              type="number"
              inputMode="numeric"
              min={0}
              value={terms.paymentDays}
              onChange={(event) => setTerms((current) => ({ ...current, paymentDays: event.target.value }))}
            />
            <div className="flex flex-wrap gap-3">
              <Button
                disabled={busy || !/^\d*$/.test(terms.paymentDays.trim())}
                onClick={() =>
                  void run(
                    () =>
                      saveTerms({
                        data: {
                          customerId,
                          legalName: terms.legalName,
                          taxId: terms.taxId,
                          address: terms.address,
                          monthlyInvoice: terms.monthlyInvoice,
                          paymentDays: terms.paymentDays.trim() === '' ? null : Number(terms.paymentDays),
                        },
                      }),
                    m.terms_saved(),
                  )
                }
              >
                {m.terms_save()}
              </Button>
              {cancel}
            </div>
          </div>
        )}
      </PageSection>

      <PageSection title={m.nav_quotes()}>
        {account.quotes.length === 0 ? (
          <p className="text-fg-muted">{m.quotes_none()}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {account.quotes.map((quote) => (
              <li key={quote.quoteId} className="flex flex-wrap items-baseline justify-between gap-x-4">
                <a className="font-semibold text-fg-link underline" href={`/devis/${quote.quoteId}`}>
                  {quote.number}
                </a>
                <span className="flex items-center gap-3">
                  <Tag tone={quoteStateTones[quote.state]}>{quoteStateWords[quote.state]()}</Tag>
                  <span className="font-number">{formatMoney(quote.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {may.quote && (
          <p className="mt-3">
            <Link to="/devis" search={{ client: customerId }} className="font-semibold text-fg-link underline">
              {m.quote_new()}
            </Link>
          </p>
        )}
      </PageSection>
    </>
  );
}
