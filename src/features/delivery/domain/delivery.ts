import { RuleError } from '@/lib/rule-error';

// Collecting and delivering (specs/027-delivery): a zone and its fee, a trip planned for a day,
// the courier's round, the proof that it was handed over. Pure rules.

export const deliveryKinds = ['collect', 'deliver'] as const;
export type DeliveryKind = (typeof deliveryKinds)[number];

export const deliveryStatuses = ['planned', 'out', 'done', 'failed', 'cancelled'] as const;
export type DeliveryStatus = (typeof deliveryStatuses)[number];

/** A trip still to be made. */
export const isOpen = (status: DeliveryStatus): boolean => status === 'planned' || status === 'out';

/** What may be planned: a deposit to bring back, or laundry to fetch at a customer's. */
export function checkPlan(plan: {
  kind: DeliveryKind;
  address: string;
  /** The deposit's state, for a delivery. */
  order: { status: string; invoiced: boolean } | null;
  fee: number;
}): void {
  if (plan.address.trim() === '') throw new RuleError('address_needed');
  if (plan.kind === 'collect') return;
  if (!plan.order) throw new RuleError('not_found');
  if (plan.order.status === 'cancelled') throw new RuleError('order_cancelled');
  if (plan.order.status === 'collected') throw new RuleError('order_not_open');
  // An invoice is written once: a fee is not added behind it.
  if (plan.fee > 0 && plan.order.invoiced) throw new RuleError('already_invoiced');
}

/** The courier leaves with it: only what is planned. */
export function checkStart(status: DeliveryStatus): void {
  if (status !== 'planned') throw new RuleError('delivery_not_planned');
}

/** It ends — handed over, or not: only what was planned or is on its way. */
export function checkClose(status: DeliveryStatus): void {
  if (!isOpen(status)) throw new RuleError('delivery_closed');
}

/** Handed over: someone received it, and says her name. */
export function checkProof(recipient: string): void {
  if (recipient.trim() === '') throw new RuleError('recipient_needed');
}

/** A round in the order a courier reads it: what is on its way first, then zone by zone. */
export function roundOf<Trip extends { status: DeliveryStatus; zoneName: string; createdAt: Date }>(trips: Trip[]): Trip[] {
  const rank = (status: DeliveryStatus) => (status === 'out' ? 0 : status === 'planned' ? 1 : 2);
  return [...trips].sort(
    (a, b) =>
      rank(a.status) - rank(b.status) ||
      a.zoneName.localeCompare(b.zoneName) ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );
}
