import { RuleError } from '@/lib/rule-error';

// Invoices and credit notes (specs/019-invoices), pure: their numbers, their lines, the tax inside
// a total, what is still due, and how money cashed on an invoice is shared among its deposits.
// An invoice is never changed nor deleted: a credit note cancels it.

export const invoiceKinds = ['invoice', 'credit'] as const;
export type InvoiceKind = (typeof invoiceKinds)[number];

/** F-2026-0042 for an invoice, A-2026-0003 for a credit note: one series each, per year. */
export const numberOf = (kind: InvoiceKind, year: number, seq: number): string =>
  `${kind === 'invoice' ? 'F' : 'A'}-${year}-${String(seq).padStart(4, '0')}`;

/**
 * The tax inside a total. Nettio's prices are what the customer pays: with VAT on, the tax is a
 * part of the total — never added on top of it.
 */
export function vatInside(total: number, percent: number): { net: number; vat: number } {
  if (percent <= 0) return { net: total, vat: 0 };
  const vat = Math.round((total * percent) / (100 + percent));
  return { net: total - vat, vat };
}

/** The day an invoice falls due: its date plus the laundry's delay. */
export function dueOn(issuedOn: string, days: number): string {
  const date = new Date(`${issuedOn}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + Math.max(0, days));
  return date.toISOString().slice(0, 10);
}

export type InvoiceStatus = 'due' | 'paid' | 'credited';

/** Cancelled by a credit note, paid in full, or still due. */
export function statusOf(invoice: { total: number; paid: number; credited: boolean }): InvoiceStatus {
  if (invoice.credited) return 'credited';
  return invoice.paid >= invoice.total ? 'paid' : 'due';
}

/** A deposit as an invoice reads it: what it holds and what it cost. */
export interface InvoicedOrder {
  orderId: string;
  number: string;
  total: number;
  packName: string | null;
  packPrice: number;
  expressAmount: number;
  /** The storage fees charged on a deposit that slept (specs/025-manager). */
  storageAmount: number;
  /** The fees of its deliveries (specs/027-delivery). */
  deliveryAmount: number;
  discount: number;
  items: {
    serviceName: string;
    articleName: string | null;
    pricing: 'per_piece' | 'per_kg';
    quantity: number;
    amount: number;
    /** What is due beyond the pack; equal to `amount` without a pack. */
    due: number;
  }[];
}

export interface InvoiceLine {
  orderId: string | null;
  /** What the line is about: a piece, a pack, express, a discount — or a whole deposit. */
  kind: 'item' | 'pack' | 'express' | 'storage' | 'delivery' | 'discount' | 'order';
  /** The deposit's number, for a line of a grouped invoice. */
  orderNumber: string;
  /** Pieces or kilos; 0 for a line that is not a quantity of something. */
  quantity: number;
  pricing: 'per_piece' | 'per_kg' | null;
  /** The piece and the service, as they were sold; empty for a pack, express or a discount. */
  label: string;
  /** True when the pack covers the line: it is shown, and costs nothing more. */
  covered: boolean;
  amount: number;
}

const said = (item: InvoicedOrder['items'][number]) =>
  item.articleName ? `${item.articleName} · ${item.serviceName}` : item.serviceName;

/**
 * The lines of an invoice. One deposit: its content line by line — with a pack, the pack's price
 * and what is due beyond it —, express, the discount. Several deposits: one line each, with what
 * it holds. Either way the lines add up to the deposits' totals, to the franc.
 */
export function linesOf(orders: InvoicedOrder[]): InvoiceLine[] {
  if (orders.length !== 1) {
    return orders.map((order) => ({
      orderId: order.orderId,
      kind: 'order',
      orderNumber: order.number,
      quantity: 0,
      pricing: null,
      label: order.items
        .map((item) =>
          item.pricing === 'per_kg'
            ? `${String(item.quantity).replace('.', ',')} kg ${said(item)}`
            : `${item.quantity} ${said(item)}`,
        )
        .join(', '),
      covered: false,
      amount: order.total,
    }));
  }
  const [order] = orders as [InvoicedOrder];
  const base = { orderId: order.orderId, orderNumber: order.number, quantity: 0, pricing: null, covered: false };
  const lines: InvoiceLine[] = [];
  if (order.packName) {
    lines.push({ ...base, kind: 'pack', label: order.packName, amount: order.packPrice });
  }
  for (const item of order.items) {
    const amount = order.packName ? item.due : item.amount;
    lines.push({
      ...base,
      kind: 'item',
      quantity: item.quantity,
      pricing: item.pricing,
      label: said(item),
      covered: order.packName !== null && amount === 0,
      amount,
    });
  }
  if (order.expressAmount > 0) {
    lines.push({ ...base, kind: 'express', label: '', amount: order.expressAmount });
  }
  if (order.storageAmount > 0) {
    lines.push({ ...base, kind: 'storage', label: '', amount: order.storageAmount });
  }
  if (order.deliveryAmount > 0) {
    lines.push({ ...base, kind: 'delivery', label: '', amount: order.deliveryAmount });
  }
  if (order.discount > 0) {
    lines.push({ ...base, kind: 'discount', label: '', amount: -order.discount });
  }
  return lines;
}

/**
 * Shares money cashed on an invoice among its deposits that still owe something, in their order.
 * Never more than what is due: an invoice is not a wallet.
 */
export function allocate(
  amount: number,
  orders: { orderId: string; balance: number }[],
): { orderId: string; amount: number }[] {
  if (!Number.isInteger(amount) || amount <= 0) throw new RuleError('amount_invalid');
  const due = orders.reduce((sum, order) => sum + Math.max(0, order.balance), 0);
  if (amount > due) throw new RuleError('payment_above_balance');
  const shares: { orderId: string; amount: number }[] = [];
  let left = amount;
  for (const order of orders) {
    if (left === 0) break;
    const share = Math.min(left, Math.max(0, order.balance));
    if (share > 0) shares.push({ orderId: order.orderId, amount: share });
    left -= share;
  }
  return shares;
}
