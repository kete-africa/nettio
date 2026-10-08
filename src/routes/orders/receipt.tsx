import { Button, EmptyState } from '@kete/design';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useState } from 'react';
import { formatPhone } from '@/features/customers/domain/phone';
import { fetchTelegramLink } from '@/features/messaging/functions';
import { fetchOrder } from '@/features/orders/functions';
import { receiptMessage } from '@/features/orders/ui/receipt';
import { statusWords } from '@/features/orders/ui/words';
import { formatDayTime, formatMoney, formatNumber } from '@/lib/format';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The receipt of a deposit (specs/002-counter, US6): a ticket to print, and the same words as a
// message the laundry sends from its own WhatsApp or Telegram. It stands outside the app's frame:
// only the ticket goes to the printer.
export const Route = createFileRoute('/depots/$orderId/recu')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: async ({ params }) => {
    const order = await fetchOrder({ data: { orderId: params.orderId } });
    return {
      order,
      // The link that ties the customer's Telegram chat, once the laundry's bot is connected.
      telegramLink: order ? await fetchTelegramLink({ data: { customerId: order.customerId } }) : null,
    };
  },
  component: ReceiptPage,
});

const linkClass =
  'inline-flex h-(--control-height) items-center justify-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover';

function ReceiptPage() {
  const { me } = Route.useRouteContext();
  const { order, telegramLink } = Route.useLoaderData();
  const [copied, setCopied] = useState(false);
  if (!order) return <EmptyState title={m.error_not_found()} />;
  const businessName = me.business?.businessName ?? m.app_name();
  const message = receiptMessage(order, businessName);
  const digits = order.customerPhone.replace(/\D/g, '');
  const balance = order.total - order.paid;
  return (
    <main className="mx-auto flex min-h-dvh max-w-[360px] flex-col gap-5 bg-canvas px-4 py-6 font-ui text-body text-fg">
      <article className="rounded-box border border-line bg-surface p-5 print:border-0 print:p-0">
        <header className="mb-4 text-center">
          <p className="font-heading text-title font-semibold">{businessName}</p>
          <p className="font-number text-headline font-semibold">{order.number}</p>
          <p className="text-body-sm text-fg-muted">{formatDayTime(order.createdAt)}</p>
        </header>
        <p className="font-semibold">{order.customerName}</p>
        <p className="mb-3 font-number text-body-sm text-fg-muted">{formatPhone(order.customerPhone)}</p>
        <ul className="border-y border-line py-2">
          {order.items.map((item) => (
            <li key={item.itemId} className="flex items-baseline justify-between gap-3 py-0.5">
              <span className="min-w-0">
                <span className="font-number">
                  {formatNumber(item.quantity, 3)}
                  {item.pricing === 'per_kg' ? ' kg' : ' ×'}
                </span>{' '}
                {item.articleName ?? item.serviceName}
                {item.defects && (
                  <span className="block text-body-sm text-fg-muted">{item.defects}</span>
                )}
              </span>
              <span className="font-number whitespace-nowrap">{formatMoney(item.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-3 flex flex-col gap-1">
          {order.packName && <Line label={order.packName} value={formatMoney(order.packPrice)} />}
          {order.supplement > 0 && <Line label={m.counter_supplement()} value={formatMoney(order.supplement)} />}
          {order.expressAmount > 0 && <Line label={m.counter_express()} value={formatMoney(order.expressAmount)} />}
          {order.discount > 0 && <Line label={m.counter_discount()} value={`− ${formatMoney(order.discount)}`} />}
          <Line strong label={m.order_total()} value={formatMoney(order.total)} />
          <Line label={m.order_paid()} value={formatMoney(order.paid)} />
          <Line strong label={m.order_balance()} value={formatMoney(balance)} />
        </dl>
        <p className="mt-4 text-center">
          {order.status === 'received' || order.status === 'in_progress'
            ? m.receipt_ready_on({ date: formatDayTime(order.promisedAt) })
            : statusWords[order.status]()}
        </p>
      </article>

      <div className="flex flex-col gap-3 print:hidden">
        <Button onClick={() => window.print()}>{m.receipt_print()}</Button>
        <a
          className={linkClass}
          target="_blank"
          rel="noopener noreferrer"
          href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
        >
          {m.receipt_send_whatsapp()}
        </a>
        <a
          className={linkClass}
          target="_blank"
          rel="noopener noreferrer"
          href={`https://t.me/+${digits}`}
        >
          {m.receipt_open_telegram()}
        </a>
        {telegramLink && (
          <p className="rounded-control border border-line bg-surface px-3 py-2 text-body-sm">
            <span className="block font-semibold">{m.receipt_telegram_link()}</span>
            <a className="break-all text-link underline" href={telegramLink}>
              {telegramLink}
            </a>
            <span className="block text-fg-muted">{m.receipt_telegram_link_hint()}</span>
          </p>
        )}
        <Button
          variant="secondary"
          onClick={() =>
            void navigator.clipboard.writeText(message).then(() => setCopied(true))
          }
        >
          {copied ? m.receipt_copied() : m.receipt_copy()}
        </Button>
        <p className="rounded-control bg-surface px-3 py-2 text-body-sm whitespace-pre-line text-fg-muted">
          {message}
        </p>
        <Link
          to="/depots/$orderId"
          params={{ orderId: order.orderId }}
          className="text-center text-link underline"
        >
          {m.receipt_back()}
        </Link>
      </div>
    </main>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-semibold' : 'text-fg-muted'}`}>
      <dt>{label}</dt>
      <dd className="font-number whitespace-nowrap">{value}</dd>
    </div>
  );
}
