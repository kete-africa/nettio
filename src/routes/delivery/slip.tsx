import { Button, EmptyState, Tag } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { fetchBusiness } from '@/features/business/functions';
import { formatPhone } from '@/features/customers/domain/phone';
import { fetchDelivery } from '@/features/delivery/functions';
import { deliveryStatusTones, deliveryStatusWords } from '@/features/delivery/ui/words';
import { fetchOrder } from '@/features/orders/functions';
import { formatDay, formatDayTime, formatMoney, formatNumber } from '@/lib/format';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The slip of a collection or a delivery stands outside the frame: the courier carries it, the
// customer signs it.
export const Route = createFileRoute('/livraisons/$deliveryId')({
  beforeLoad: async ({ location }) => requirePerson(location.href),
  loader: async ({ params }) => {
    const [trip, business] = await Promise.all([fetchDelivery({ data: { deliveryId: params.deliveryId } }), fetchBusiness()]);
    const order = trip?.orderId ? await fetchOrder({ data: { orderId: trip.orderId } }) : null;
    return { trip, business, order };
  },
  component: SlipPage,
});

function SlipPage() {
  const { trip, business, order } = Route.useLoaderData();
  if (!trip) return <EmptyState title={m.error_not_found()} />;
  const deliver = trip.kind === 'deliver';
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-5 bg-canvas px-4 py-6 font-ui text-body text-fg">
      <article className="rounded-box border border-line bg-surface p-5 print:border-0 print:p-0">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <p className="font-heading text-title font-semibold">{business?.settings?.businessName ?? m.app_name()}</p>
          <div className="text-right">
            <h1 className="font-heading text-title font-semibold">
              {deliver ? m.trip_slip_deliver({ number: trip.orderNumber ?? '' }) : m.trip_slip_collect()}
            </h1>
            <p className="text-body-sm text-fg-muted">{formatDay(trip.plannedOn)}</p>
            <p className="mt-1 print:hidden">
              <Tag tone={deliveryStatusTones[trip.status]}>{deliveryStatusWords[trip.status]()}</Tag>
            </p>
          </div>
        </header>
        <p className="text-body-sm text-fg-muted">{m.invoice_customer()}</p>
        <p className="font-semibold">{trip.customerName}</p>
        <p className="font-number text-body-sm text-fg-muted">{formatPhone(trip.customerPhone)}</p>
        <p className="mb-4">
          {trip.zoneName} · {trip.address}
        </p>
        {trip.note && <p className="mb-4 text-body-sm">{trip.note}</p>}
        {order && (
          <ul className="border-y border-line py-2">
            {order.items.map((item) => (
              <li key={item.itemId} className="py-1">
                {item.pricing === 'per_kg' ? `${formatNumber(item.quantity, 3)} kg` : `${formatNumber(item.quantity)} ×`}{' '}
                {item.articleName ? `${item.articleName} · ${item.serviceName}` : item.serviceName}
              </li>
            ))}
          </ul>
        )}
        {deliver && (
          <dl className="mt-3 flex flex-col gap-1">
            {trip.fee > 0 && (
              <div className="flex items-baseline justify-between gap-3">
                <dt>{m.invoice_line_delivery()}</dt>
                <dd className="font-number">{formatMoney(trip.fee)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 font-semibold">
              <dt>{trip.status === 'done' ? m.trip_cashed() : m.trip_to_collect_label()}</dt>
              <dd className="font-number">{formatMoney(trip.status === 'done' ? trip.cashed : trip.balance)}</dd>
            </div>
          </dl>
        )}
        <div className="mt-6 grid grid-cols-2 gap-6 text-body-sm">
          <div>
            <p className="text-fg-muted">{m.trip_recipient()}</p>
            <p className="mt-1 min-h-10 border-b border-line font-semibold">{trip.recipient}</p>
            {trip.closedAt && trip.status === 'done' && (
              <p className="mt-1 text-fg-muted">{formatDayTime(trip.closedAt)}</p>
            )}
          </div>
          <div>
            <p className="text-fg-muted">{m.trip_signature()}</p>
            <p className="mt-1 min-h-10 border-b border-line" />
          </div>
        </div>
        {trip.proofNote && <p className="mt-3 text-body-sm">{trip.proofNote}</p>}
        {trip.failure && <p className="mt-3 text-body-sm">{m.trip_failure({ reason: trip.failure })}</p>}
      </article>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          {m.quote_print()}
        </Button>
        <a className="inline-flex h-(--control-height) items-center font-semibold text-fg-link underline" href="/livraisons">
          {m.nav_delivery()}
        </a>
      </div>
    </main>
  );
}
