import type { TagTone } from '@kete/design';
import { formatMoney, formatNumber } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { InvoiceLine, InvoiceStatus } from '../domain/invoice';
import type { Invoice } from '../invoice.record';

export const invoiceStatusWords: Record<InvoiceStatus, () => string> = {
  due: m.invoice_status_due,
  paid: m.invoice_status_paid,
  credited: m.invoice_status_credited,
};

export const invoiceStatusTones: Record<InvoiceStatus, TagTone> = {
  due: 'error',
  paid: 'validated',
  credited: 'neutral',
};

/** A line as an invoice says it. */
export function lineWords(line: InvoiceLine): string {
  if (line.kind === 'pack') return m.invoice_line_pack({ pack: line.label });
  if (line.kind === 'express') return m.counter_express();
  if (line.kind === 'storage') return m.invoice_line_storage();
  if (line.kind === 'delivery') return m.invoice_line_delivery();
  if (line.kind === 'discount') return m.counter_discount();
  if (line.kind === 'order') return `${line.orderNumber} · ${line.label}`;
  const quantity =
    line.pricing === 'per_kg' ? `${formatNumber(line.quantity, 3)} kg` : `${formatNumber(line.quantity)} ×`;
  return `${quantity} ${line.label}`;
}

/** The invoice as a message the laundry sends from its own WhatsApp or Telegram. */
export function invoiceMessage(invoice: Invoice, due: number): string {
  return [
    invoice.kind === 'credit'
      ? m.invoice_message_credit({ business: invoice.seller.name, number: invoice.number })
      : m.invoice_message_title({ business: invoice.seller.name, number: invoice.number }),
    ...invoice.lines.map((line) => `${lineWords(line)} : ${formatMoney(line.amount)}`),
    m.invoice_message_total({ total: formatMoney(invoice.total) }),
    ...(invoice.kind === 'invoice'
      ? [
          due > 0
            ? m.invoice_message_due({ paid: formatMoney(invoice.paid), due: formatMoney(due) })
            : m.invoice_message_paid(),
        ]
      : []),
  ].join('\n');
}
