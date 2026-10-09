import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { perform } from '@/platform/screen';
import {
  cashSubscriptionInput,
  customerPriceInput,
  customerRef,
  decideQuoteInput,
  monthRunInput,
  quoteInput,
  quoteRef,
  subscriptionInput,
  subscriptionRef,
  termsInput,
  topUpInput,
} from './accounts.record';
import type { AccountView } from './capabilities';
import type { PriceLine, QuoteStatus, Subscription } from './domain/accounts';
import type { Quote, QuoteSummary } from './infrastructure/accounts.tables';

const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);

export const fetchAccount = createServerFn({ method: 'GET' })
  .validator((input: unknown) => customerRef.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<AccountView | null>('accounts_get', data);
    return read.ok ? read.output : null;
  });

/** Her own prices and her credit: what the counter needs once it knows who she is. */
export const fetchCounterAccount = createServerFn({ method: 'GET' })
  .validator((input: unknown) => customerRef.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<{ prices: PriceLine[]; credit: number }>('accounts_counter', data);
    return read.ok ? read.output : { prices: [], credit: 0 };
  });

export const saveTerms = createServerFn({ method: 'POST' })
  .validator((input: unknown) => termsInput.parse(input))
  .handler(({ data }) => perform<{ customerId: string }>('accounts_set_terms', data));

export const saveCustomerPrice = createServerFn({ method: 'POST' })
  .validator((input: unknown) => customerPriceInput.parse(input))
  .handler(({ data }) => perform<{ amount: number | null }>('accounts_set_price', data));

export const topUp = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, topUp: topUpInput }).parse(input))
  .handler(({ data }) =>
    perform<{ cashed: number; credit: number; balance: number }>('credit_top_up', data.topUp, data.key),
  );

export const startSubscription = createServerFn({ method: 'POST' })
  .validator((input: unknown) => subscriptionInput.parse(input))
  .handler(({ data }) => perform<{ subscriptionId: string; name: string }>('subscriptions_start', data));

export const endSubscription = createServerFn({ method: 'POST' })
  .validator((input: unknown) => subscriptionRef.parse(input))
  .handler(({ data }) => perform<{ subscriptionId: string }>('subscriptions_end', data));

export const cashSubscription = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, month: cashSubscriptionInput }).parse(input))
  .handler(({ data }) =>
    perform<{ name: string; period: string; cashed: number; credit: number; balance: number }>(
      'subscriptions_cash',
      data.month,
      data.key,
    ),
  );

export const fetchSubscriptionsDue = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<{
    period: string;
    due: (Subscription & { customerName: string })[];
    running: (Subscription & { customerName: string; cashed: boolean })[];
  }>('subscriptions_due', {});
  return read.ok ? read.output : null;
});

export type ListedQuote = QuoteSummary & { state: QuoteStatus | 'expired' };

export const fetchQuotes = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<{ quotes: ListedQuote[]; mayWrite: boolean }>('quotes_list', {});
  return read.ok ? read.output : null;
});

export const fetchQuote = createServerFn({ method: 'GET' })
  .validator((input: unknown) => quoteRef.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<{ quote: Quote; state: QuoteStatus | 'expired' } | null>('quotes_get', data);
    return read.ok ? read.output : null;
  });

export const writeQuote = createServerFn({ method: 'POST' })
  .validator((input: unknown) => quoteInput.parse(input))
  .handler(({ data }) => perform<{ quoteId: string; number: string; total: number }>('quotes_write', data));

export const decideQuote = createServerFn({ method: 'POST' })
  .validator((input: unknown) => decideQuoteInput.parse(input))
  .handler(({ data }) => perform<{ number: string; accepted: boolean }>('quotes_decide', data));

export const fetchMonthPreview = createServerFn({ method: 'GET' })
  .validator((input: unknown) => monthRunInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<{ month: string; customers: { customerId: string; name: string; orders: number }[] }>(
      'invoices_month_preview',
      data,
    );
    return read.ok ? read.output : null;
  });

export const runMonth = createServerFn({ method: 'POST' })
  .validator((input: unknown) => monthRunInput.parse(input))
  .handler(({ data }) =>
    perform<{ month: string; issued: { customerName: string; invoiceId: string; number: string; total: number; orders: number }[] }>(
      'invoices_month_run',
      data,
    ),
  );
