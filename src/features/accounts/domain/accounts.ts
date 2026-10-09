import { RuleError } from '@/lib/rule-error';

// A customer's account beyond her deposits (specs/026-accounts): her own prices, the credit she
// paid ahead, a subscription that recharges it, a quote. Pure rules; nothing here reads a clock
// or a database.

export interface PriceLine {
  serviceId: string;
  articleId: string | null;
  amount: number;
}

/** The prices a customer pays: her own where the laundry set one, the catalogue's elsewhere. */
export function withCustomerPrices<Price extends PriceLine>(catalogue: Price[], hers: PriceLine[]): PriceLine[] {
  const same = (a: PriceLine, b: PriceLine) => a.serviceId === b.serviceId && a.articleId === b.articleId;
  return [
    ...catalogue.map((price) => hers.find((own) => same(own, price)) ?? price),
    // A price of her own for something the catalogue does not price: she may still be sold it.
    ...hers.filter((own) => !catalogue.some((price) => same(own, price))),
  ];
}

export const creditKinds = ['top_up', 'spend', 'returned'] as const;
export type CreditKind = (typeof creditKinds)[number];

/** What a customer still holds ahead: what she paid in, minus what her deposits took. */
export function balanceOf(entries: { kind: CreditKind; amount: number }[]): number {
  return entries.reduce((sum, entry) => sum + (entry.kind === 'spend' ? -entry.amount : entry.amount), 0);
}

/** A top-up: money really received, and the credit it gives — never less than the money. */
export function checkTopUp(topUp: { cashed: number; credit: number; method: string }): void {
  const whole = Number.isInteger(topUp.cashed) && Number.isInteger(topUp.credit);
  if (!whole || topUp.cashed <= 0) throw new RuleError('amount_invalid');
  if (topUp.credit < topUp.cashed) throw new RuleError('credit_below_cashed');
  // Credit is not bought with credit.
  if (topUp.method === 'credit') throw new RuleError('invalid_input');
}

export function checkSpend(amount: number, balance: number): void {
  if (amount > balance) throw new RuleError('credit_insufficient', { amount: Math.max(0, balance) });
}

/** « 2026-10 »: the month a subscription is cashed for. */
export const periodOf = (date: Date): string => date.toISOString().slice(0, 7);

export interface Subscription {
  subscriptionId: string;
  customerId: string;
  name: string;
  /** What the customer pays each month. */
  amount: number;
  /** The credit a month gives her. */
  credit: number;
  startedOn: string;
  endedOn: string | null;
}

/** Whether a subscription runs in a month: started by its end, not ended before it starts. */
export function runsIn(subscription: Pick<Subscription, 'startedOn' | 'endedOn'>, period: string): boolean {
  return subscription.startedOn.slice(0, 7) <= period && (subscription.endedOn === null || subscription.endedOn.slice(0, 7) >= period);
}

export function checkSubscription(subscription: { name: string; amount: number; credit: number }): void {
  if (subscription.name.trim() === '') throw new RuleError('invalid_input');
  if (!Number.isInteger(subscription.amount) || subscription.amount <= 0) throw new RuleError('amount_invalid');
  if (!Number.isInteger(subscription.credit) || subscription.credit < subscription.amount) {
    throw new RuleError('credit_below_cashed');
  }
}

/** « D-2026-0042 »: quotes are numbered by year, like invoices. */
export const quoteNumber = (year: number, seq: number): string => `D-${year}-${String(seq).padStart(4, '0')}`;

export const quoteStatuses = ['open', 'accepted', 'refused'] as const;
export type QuoteStatus = (typeof quoteStatuses)[number];

/** A quote that nobody answered is no longer an offer after its date. */
export function quoteState(quote: { status: QuoteStatus; validUntil: string }, today: string): QuoteStatus | 'expired' {
  return quote.status === 'open' && quote.validUntil < today ? 'expired' : quote.status;
}

export function checkQuoteDecision(quote: { status: QuoteStatus; validUntil: string }, today: string): void {
  const state = quoteState(quote, today);
  if (state === 'expired') throw new RuleError('quote_expired');
  if (state !== 'open') throw new RuleError('already_decided');
}

/** The first day of a month and of the next: the deposits a monthly invoice gathers. */
export function monthBounds(month: string): { from: string; to: string } {
  const [year = 0, index = 1] = month.split('-').map(Number);
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-01` };
}
