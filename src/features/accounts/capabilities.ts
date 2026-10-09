import { defineCapability } from '@kete/capabilities';
import { readCatalog } from '@/features/catalog';
import { findCustomer } from '@/features/customers';
import { holds } from '@/platform/rights';
import {
  cashSubscriptionInput,
  customerPriceInput,
  customerRef,
  decideQuoteInput,
  monthRunInput,
  noInput,
  quoteInput,
  quoteRef,
  subscriptionInput,
  subscriptionRef,
  termsInput,
  topUpInput,
} from './accounts.record';
import {
  cashSubscription,
  decideQuote,
  endSubscription,
  runMonthlyInvoices,
  setCustomerPrice,
  setCustomerTerms,
  startSubscription,
  topUpCredit,
  writeQuote,
} from './commands';
import { monthBounds, periodOf, quoteState, runsIn, type QuoteStatus, type Subscription } from './domain/accounts';
import {
  creditBalance,
  creditEntries,
  customerPrices,
  findQuote,
  listQuotes,
  listSubscriptions,
  monthlyCustomers,
  readTerms,
  uninvoicedIn,
  type CreditEntry,
  type CustomerTerms,
  type Quote,
  type QuoteSummary,
} from './infrastructure/accounts.tables';

export interface AccountView {
  terms: CustomerTerms;
  /** Her own prices, each with the catalogue's — what she would pay otherwise. */
  prices: {
    serviceId: string;
    articleId: string | null;
    serviceName: string;
    articleName: string | null;
    amount: number;
    catalogue: number | null;
  }[];
  credit: { balance: number; entries: CreditEntry[] };
  subscriptions: (Subscription & { cashed: boolean; running: boolean })[];
  quotes: (QuoteSummary & { state: QuoteStatus | 'expired' })[];
  period: string;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * What a screen, a copilot or an agent may do with a customer's account. Reading is level 1.
 * Money, an agreement or an offer commits the laundry: an agent only prepares it. A customer's
 * price is the laundry's decision alone — the assistant is never offered that gesture.
 */
export const accountCapabilities = [
  defineCapability({
    name: 'accounts_get',
    description:
      'A customer’s account beyond her deposits: what the laundry agreed with her (company mentions, monthly invoice, days to pay), her own prices against the catalogue’s, her prepaid credit and its movements, her subscriptions and whether this month is cashed, her quotes.',
    permission: 'accounts:read',
    autonomy: 1,
    classification: 'confidential',
    input: customerRef,
    async run(input, { db }): Promise<AccountView | null> {
      if (!(await findCustomer(db, input.customerId))) return null;
      const catalog = await readCatalog(db);
      const period = periodOf(new Date());
      return {
        terms: await readTerms(db, input.customerId),
        prices: (await customerPrices(db, input.customerId)).map((price) => ({
          ...price,
          serviceName: catalog.services.find((s) => s.serviceId === price.serviceId)?.name ?? '',
          articleName: catalog.articles.find((a) => a.articleId === price.articleId)?.name ?? null,
          catalogue:
            catalog.prices.find((p) => p.serviceId === price.serviceId && p.articleId === price.articleId)?.amount ?? null,
        })),
        credit: {
          balance: await creditBalance(db, input.customerId),
          entries: await creditEntries(db, input.customerId),
        },
        subscriptions: (await listSubscriptions(db, { customerId: input.customerId, period })).map((subscription) => ({
          ...subscription,
          running: runsIn(subscription, period),
        })),
        quotes: (await listQuotes(db, input.customerId)).map((quote) => ({ ...quote, state: quoteState(quote, today()) })),
        period,
      };
    },
  }),
  defineCapability({
    name: 'accounts_counter',
    description:
      'What the counter needs about a customer before pricing or cashing: her own prices (they replace the catalogue’s) and her prepaid credit.',
    permission: 'customers:read',
    autonomy: 1,
    classification: 'confidential',
    input: customerRef,
    async run(input, { db }) {
      return {
        prices: await customerPrices(db, input.customerId),
        credit: await creditBalance(db, input.customerId),
      };
    },
  }),
  defineCapability({
    name: 'accounts_set_terms',
    description:
      'Writes what the laundry agreed with a customer: a company’s legal name, tax number and address (printed on its invoices), one invoice a month, the days it has to pay.',
    permission: 'accounts:manage',
    autonomy: 3,
    input: termsInput,
    command: setCustomerTerms,
    draft: { recordType: 'customer_terms' },
  }),
  defineCapability({
    name: 'accounts_set_price',
    description:
      'Sets a customer’s own price for a service (and an article), or removes it. The laundry’s decision alone.',
    permission: 'accounts:manage',
    autonomy: 3,
    input: customerPriceInput,
    command: setCustomerPrice,
    draft: { recordType: 'customer_price' },
  }),
  defineCapability({
    name: 'credit_top_up',
    description:
      'Records money a customer pays ahead (cash goes into the person’s open till) and the credit it gives her — the same amount unless the laundry gives more.',
    permission: 'credit:top_up',
    autonomy: 4,
    input: topUpInput,
    command: topUpCredit,
    draft: { recordType: 'credit_top_up' },
  }),
  defineCapability({
    name: 'subscriptions_due',
    description:
      'The running subscriptions whose month is not cashed yet: who, which, how much — and all the running ones.',
    permission: 'accounts:read',
    autonomy: 1,
    classification: 'confidential',
    input: noInput,
    async run(_input, { db }) {
      const period = periodOf(new Date());
      const running = (await listSubscriptions(db, { period })).filter((subscription) => runsIn(subscription, period));
      return { period, running, due: running.filter((subscription) => !subscription.cashed) };
    },
  }),
  defineCapability({
    name: 'subscriptions_start',
    description:
      'Starts a subscription for a customer: what she pays each month, and the credit a month gives her.',
    permission: 'accounts:manage',
    autonomy: 3,
    input: subscriptionInput,
    command: startSubscription,
    draft: { recordType: 'subscription' },
  }),
  defineCapability({
    name: 'subscriptions_end',
    description: 'Ends a subscription today: its later months are not cashed any more.',
    permission: 'accounts:manage',
    autonomy: 3,
    input: subscriptionRef,
    command: endSubscription,
    draft: { recordType: 'subscription_end' },
  }),
  defineCapability({
    name: 'subscriptions_cash',
    description:
      'Cashes a month of a subscription, once: the money is received and its credit goes to the customer’s account.',
    permission: 'credit:top_up',
    autonomy: 4,
    input: cashSubscriptionInput,
    command: cashSubscription,
    draft: { recordType: 'subscription_month' },
  }),
  defineCapability({
    name: 'quotes_list',
    description: 'The quotes of the laundry, the latest first: number, customer, total, until when it holds, its answer.',
    permission: 'quotes:read',
    autonomy: 1,
    classification: 'confidential',
    input: customerRef.partial(),
    async run(input, { db }) {
      return {
        quotes: (await listQuotes(db, input.customerId)).map((quote) => ({ ...quote, state: quoteState(quote, today()) })),
        mayWrite: holds('quotes:write'),
      };
    },
  }),
  defineCapability({
    name: 'quotes_get',
    description: 'One quote: its lines as they were offered, its total, until when it holds, its answer.',
    permission: 'quotes:read',
    autonomy: 1,
    classification: 'confidential',
    input: quoteRef,
    async run(input, { db }): Promise<{ quote: Quote; state: QuoteStatus | 'expired' } | null> {
      const quote = await findQuote(db, input.quoteId);
      return quote ? { quote, state: quoteState(quote, today()) } : null;
    },
  }),
  defineCapability({
    name: 'quotes_write',
    description:
      'Writes a quote for a customer from the catalogue, at her own prices where she has some: services, articles, quantities; days it holds.',
    permission: 'quotes:write',
    autonomy: 3,
    input: quoteInput,
    command: writeQuote,
    draft: { recordType: 'quote' },
  }),
  defineCapability({
    name: 'quotes_decide',
    description: 'Records the customer’s answer to a quote — accepted or refused — once, while it still holds.',
    permission: 'quotes:write',
    autonomy: 3,
    input: decideQuoteInput,
    command: decideQuote,
    draft: { recordType: 'quote_answer' },
  }),
  defineCapability({
    name: 'invoices_month_preview',
    description:
      'For a month: the customers invoiced monthly and how many of their deposits of that month are on no invoice yet.',
    permission: 'invoices:read',
    autonomy: 1,
    classification: 'confidential',
    input: monthRunInput,
    async run(input, { db }) {
      const period = monthBounds(input.month);
      const customers = [];
      for (const customer of await monthlyCustomers(db)) {
        customers.push({ ...customer, orders: (await uninvoicedIn(db, customer.customerId, period)).length });
      }
      return { month: input.month, customers };
    },
  }),
  defineCapability({
    name: 'invoices_month_run',
    description:
      'Issues the month’s invoices: for each customer invoiced monthly, one invoice of her deposits of that month that are on none.',
    permission: 'invoices:issue',
    autonomy: 4,
    input: monthRunInput,
    command: runMonthlyInvoices,
    draft: { recordType: 'monthly_invoices' },
  }),
];
