import { RuleError } from '@/lib/rule-error';

// The life of a deposit and the rules of its money (docs/product/model.md), pure.

export const orderStatuses = ['received', 'in_progress', 'ready', 'collected', 'cancelled'] as const;
export type OrderStatus = (typeof orderStatuses)[number];

export const paymentMethods = ['cash', 'mobile_money', 'card', 'transfer', 'credit'] as const;
export type PaymentMethod = (typeof paymentMethods)[number];

/** The ways money comes in; « credit » is money that already came (specs/026-accounts). */
export const moneyMethods: PaymentMethod[] = ['cash', 'mobile_money', 'card', 'transfer'];

export const paymentKinds = ['deposit', 'balance', 'refund'] as const;
export type PaymentKind = (typeof paymentKinds)[number];

/** A deposit that is over: nothing changes it any more. */
export const isClosed = (status: OrderStatus): boolean =>
  status === 'collected' || status === 'cancelled';

/** The number of a deposit: the code of its site and the next number of that site. */
export const orderNumber = (siteCode: string, seq: number): string =>
  `${siteCode}-${String(seq).padStart(4, '0')}`;

/** The date promised to the customer: the usual delay, or the express one. */
export function promisedDate(
  from: Date,
  settings: { promisedHours: number; expressHours: number },
  express: boolean,
): Date {
  const hours = express ? settings.expressHours : settings.promisedHours;
  return new Date(from.getTime() + hours * 3_600_000);
}

export function markReady(status: OrderStatus): OrderStatus {
  if (status !== 'received' && status !== 'in_progress') throw new RuleError('order_not_open');
  return 'ready';
}

/**
 * Hands a deposit over: it must be ready, and paid — unless the person may release it unpaid.
 */
export function collect(
  order: { status: OrderStatus; total: number; paid: number },
  mayReleaseUnpaid: boolean,
): OrderStatus {
  if (order.status !== 'ready') throw new RuleError('order_not_ready');
  const balance = order.total - order.paid;
  if (balance > 0 && !mayReleaseUnpaid) throw new RuleError('balance_due', { amount: balance });
  return 'collected';
}

/** Cancels a deposit: before it is ready, with a reason, and once its money was given back. */
export function cancel(
  order: { status: OrderStatus; paid: number },
  reason: string | undefined,
): OrderStatus {
  if (order.status !== 'received' && order.status !== 'in_progress') {
    throw new RuleError('order_not_open');
  }
  if (!reason?.trim()) throw new RuleError('reason_needed');
  if (order.paid > 0) throw new RuleError('refund_first', { amount: order.paid });
  return 'cancelled';
}

/**
 * What a payment is, once checked: money never exceeds what is due, and a cancelled deposit takes
 * none. It settles the deposit (`balance`) or is an advance on it (`deposit`).
 */
export function payment(
  order: { status: OrderStatus; total: number; paid: number },
  amount: number,
): PaymentKind {
  if (order.status === 'cancelled') throw new RuleError('order_cancelled');
  if (!Number.isInteger(amount) || amount <= 0) throw new RuleError('amount_invalid');
  const balance = order.total - order.paid;
  if (amount > balance) throw new RuleError('payment_above_balance', { amount: balance });
  return amount === balance ? 'balance' : 'deposit';
}

/** A refund gives back part of what was paid, with a reason. */
export function refund(order: { paid: number }, amount: number, reason: string | undefined): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new RuleError('amount_invalid');
  if (!reason?.trim()) throw new RuleError('reason_needed');
  if (amount > order.paid) throw new RuleError('refund_above_paid', { amount: order.paid });
}
