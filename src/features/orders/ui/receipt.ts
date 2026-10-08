import { formatDayTime, formatMoney, formatNumber } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { Order } from '../order.record';

/** The content of a deposit in a few words: « 4 Chemise, 2 Pantalon ». */
export function contentWords(order: Pick<Order, 'items'>): string {
  return order.items
    .map(
      (item) =>
        `${formatNumber(item.quantity, 3)}${item.pricing === 'per_kg' ? ' kg' : ''} ${item.articleName ?? item.serviceName}`,
    )
    .join(', ');
}

/**
 * The receipt as a message (docs/product/voix.md): in the laundry's name, never Nettio's. Sent by
 * the laundry from its own messaging until the channel adapters arrive (specs/006).
 */
export function receiptMessage(order: Order, businessName: string): string {
  return m.receipt_message({
    customer: order.customerName,
    number: order.number,
    content: order.packName ? `${contentWords(order)} (${order.packName})` : contentWords(order),
    total: formatMoney(order.total),
    paid: formatMoney(order.paid),
    balance: formatMoney(order.total - order.paid),
    date: formatDayTime(order.promisedAt),
    business: businessName,
  });
}
