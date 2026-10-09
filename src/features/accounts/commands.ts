import { defineCommand } from '@kete/commands';
import { priceOf, readCatalog } from '@/features/catalog';
import { findCustomer } from '@/features/customers';
import { issueInvoice } from '@/features/invoices/commands';
import { priceOrder } from '@/features/orders/domain/pricing';
import { personBehind } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import {
  cashSubscriptionInput,
  customerPriceInput,
  decideQuoteInput,
  monthRunInput,
  quoteInput,
  subscriptionInput,
  subscriptionRef,
  termsInput,
  topUpInput,
} from './accounts.record';
import {
  checkQuoteDecision,
  checkSubscription,
  checkTopUp,
  monthBounds,
  periodOf,
  quoteNumber,
  runsIn,
  withCustomerPrices,
} from './domain/accounts';
import {
  creditBalance,
  customerPrices,
  decideQuoteAs,
  endSubscriptionOn,
  findQuote,
  findSubscription,
  insertQuote,
  insertSubscription,
  insertTopUp,
  monthlyCustomers,
  openTillOf,
  saveCustomerPrice,
  saveTerms,
  takeQuoteNumber,
  uninvoicedIn,
} from './infrastructure/accounts.tables';

const today = (): string => new Date().toISOString().slice(0, 10);

/** What the laundry agreed with a customer: a company's mentions, one invoice a month, its delay. */
export const setCustomerTerms = defineCommand({
  name: 'set-customer-terms',
  input: termsInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (!(await findCustomer(db, input.customerId))) throw new RuleError('not_found');
    const { customerId, ...terms } = input;
    await saveTerms(db, organizationId, customerId, terms);
    return { customerId, monthlyInvoice: terms.monthlyInvoice };
  },
  summarize: (_input, output) => `Customer terms set${output.monthlyInvoice ? ' (monthly invoice)' : ''}`,
});

/** A customer's own price: the laundry's decision — Nettio proposes none. */
export const setCustomerPrice = defineCommand({
  name: 'set-customer-price',
  input: customerPriceInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (!(await findCustomer(db, input.customerId))) throw new RuleError('not_found');
    const catalog = await readCatalog(db);
    const service = catalog.services.find((s) => s.serviceId === input.serviceId);
    if (!service) throw new RuleError('not_found');
    // By the kilo there is no article; by the piece there must be one.
    const articleId = service.pricing === 'per_kg' ? null : input.articleId;
    if (service.pricing === 'per_piece' && !catalog.articles.some((a) => a.articleId === articleId)) {
      throw new RuleError('not_found');
    }
    await saveCustomerPrice(db, organizationId, { ...input, articleId });
    return { customerId: input.customerId, amount: input.amount };
  },
  summarize: (_input, output) =>
    output.amount === null ? 'Customer price removed' : `Customer price set: ${output.amount}`,
});

/** Where money paid ahead goes: cash into the person's open till, the rest nowhere to count. */
async function tillForCash(db: Parameters<typeof openTillOf>[0], method: string, cashierId: string) {
  if (method !== 'cash') return null;
  const sessionId = await openTillOf(db, cashierId);
  if (!sessionId) throw new RuleError('cash_session_needed');
  return sessionId;
}

/** A customer pays ahead: her credit grows by what the laundry gives for it. */
export const topUpCredit = defineCommand({
  name: 'top-up-credit',
  input: topUpInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    if (!(await findCustomer(db, input.customerId))) throw new RuleError('not_found');
    const credit = input.credit ?? input.cashed;
    checkTopUp({ cashed: input.cashed, credit, method: input.method });
    await insertTopUp(db, organizationId, {
      customerId: input.customerId,
      credit,
      cashed: input.cashed,
      method: input.method,
      cashSessionId: await tillForCash(db, input.method, personBehind(actor)),
      createdBy: personBehind(actor),
    });
    return { customerId: input.customerId, cashed: input.cashed, credit, balance: await creditBalance(db, input.customerId) };
  },
  summarize: (_input, output) => `Credit topped up: ${output.cashed} cashed, ${output.credit} credited`,
});

/** A subscription: each month the customer pays its amount, and receives its credit. */
export const startSubscription = defineCommand({
  name: 'start-subscription',
  input: subscriptionInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    if (!(await findCustomer(db, input.customerId))) throw new RuleError('not_found');
    const credit = input.credit ?? input.amount;
    checkSubscription({ name: input.name, amount: input.amount, credit });
    const subscriptionId = await insertSubscription(db, organizationId, {
      customerId: input.customerId,
      name: input.name,
      amount: input.amount,
      credit,
      createdBy: personBehind(actor),
    });
    return { subscriptionId, name: input.name };
  },
  summarize: (_input, output) => `Subscription started: ${output.name}`,
});

export const endSubscription = defineCommand({
  name: 'end-subscription',
  input: subscriptionRef,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    if (!(await endSubscriptionOn(db, input.subscriptionId))) throw new RuleError('not_found');
    return { subscriptionId: input.subscriptionId };
  },
  summarize: () => 'Subscription ended',
});

/** A month of a subscription is cashed, once: its credit goes to the customer's account. */
export const cashSubscription = defineCommand({
  name: 'cash-subscription',
  input: cashSubscriptionInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const subscription = await findSubscription(db, input.subscriptionId);
    if (!subscription) throw new RuleError('not_found');
    const period = input.period ?? periodOf(new Date());
    if (!runsIn(subscription, period)) throw new RuleError('subscription_not_running');
    const entryId = await insertTopUp(db, organizationId, {
      customerId: subscription.customerId,
      credit: subscription.credit,
      cashed: subscription.amount,
      method: input.method,
      cashSessionId: await tillForCash(db, input.method, personBehind(actor)),
      subscriptionId: subscription.subscriptionId,
      period,
      createdBy: personBehind(actor),
    });
    if (!entryId) throw new RuleError('subscription_already_cashed');
    return {
      name: subscription.name,
      period,
      cashed: subscription.amount,
      credit: subscription.credit,
      balance: await creditBalance(db, subscription.customerId),
    };
  },
  summarize: (_input, output) => `Subscription ${output.name} cashed for ${output.period}`,
});

/** A quote: what it would cost this customer, at her prices, written as it was offered. */
export const writeQuote = defineCommand({
  name: 'write-quote',
  input: quoteInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const customer = await findCustomer(db, input.customerId);
    if (!customer) throw new RuleError('not_found');
    const catalog = await readCatalog(db);
    const prices = withCustomerPrices(catalog.prices, await customerPrices(db, customer.customerId));
    const lines = input.lines.map((line) => {
      const service = catalog.services.find((s) => s.serviceId === line.serviceId && s.active);
      if (!service) throw new RuleError('not_found');
      const articleId = service.pricing === 'per_kg' ? null : line.articleId;
      const article = catalog.articles.find((a) => a.articleId === articleId && a.active) ?? null;
      if (service.pricing === 'per_piece' && !article) throw new RuleError('not_found');
      const unitPrice = priceOf(prices, service.serviceId, articleId);
      if (unitPrice === undefined) {
        throw new RuleError('not_sold', { name: article ? `${article.name} · ${service.name}` : service.name });
      }
      return { service, article, quantity: line.quantity, unitPrice };
    });
    const price = priceOrder({
      lines: lines.map((line) => ({
        serviceId: line.service.serviceId,
        articleId: line.article?.articleId ?? null,
        pricing: line.service.pricing,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
      })),
      pack: null,
      expressPercent: 0,
      discount: 0,
    });
    const now = new Date();
    const year = now.getUTCFullYear();
    const number = quoteNumber(year, await takeQuoteNumber(db, organizationId, year));
    const validUntil = new Date(now.getTime() + input.validDays * 86_400_000).toISOString().slice(0, 10);
    const quoteId = await insertQuote(db, organizationId, {
      number,
      customerId: customer.customerId,
      customerName: customer.name,
      validUntil,
      note: input.note,
      total: price.total,
      createdBy: personBehind(actor),
      lines: lines.map((line, index) => ({
        serviceName: line.service.name,
        articleName: line.article?.name ?? null,
        pricing: line.service.pricing,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        amount: price.lines[index]?.amount ?? 0,
      })),
    });
    return { quoteId, number, total: price.total };
  },
  summarize: (_input, output) => `Quote ${output.number} written: ${output.total}`,
});

/** The customer's answer to a quote, once, while it still holds. */
export const decideQuote = defineCommand({
  name: 'decide-quote',
  input: decideQuoteInput,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    const quote = await findQuote(db, input.quoteId, true);
    if (!quote) throw new RuleError('not_found');
    checkQuoteDecision(quote, today());
    await decideQuoteAs(db, quote.quoteId, input.accepted ? 'accepted' : 'refused');
    return { number: quote.number, accepted: input.accepted };
  },
  summarize: (_input, output) => `Quote ${output.number} ${output.accepted ? 'accepted' : 'refused'}`,
});

/**
 * The month's invoices of the customers invoiced monthly: for each, one invoice of her deposits
 * of that month that are on none — through the same gesture as an invoice made by hand.
 */
export const runMonthlyInvoices = defineCommand({
  name: 'run-monthly-invoices',
  input: monthRunInput,
  reversibility: { reversible: false },
  async handler(input, context) {
    const period = monthBounds(input.month);
    const issued: { customerName: string; invoiceId: string; number: string; total: number; orders: number }[] = [];
    for (const customer of await monthlyCustomers(context.db)) {
      const orderIds = await uninvoicedIn(context.db, customer.customerId, period);
      if (orderIds.length === 0) continue;
      const invoice = await issueInvoice.handler({ orderIds }, context);
      issued.push({ customerName: customer.name, ...invoice, orders: orderIds.length });
    }
    return { month: input.month, issued };
  },
  summarize: (_input, output) => `Monthly invoices for ${output.month}: ${output.issued.length}`,
});
