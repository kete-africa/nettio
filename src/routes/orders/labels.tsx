import { Button, EmptyState } from '@kete/design';
import { createFileRoute, Link } from '@tanstack/react-router';
import { Barcode } from '@/features/device/ui/Barcode';
import { useDevice } from '@/features/device/ui/device';
import { fetchOrder } from '@/features/orders/functions';
import { fetchWork } from '@/features/workshop/functions';
import { formatDay, formatNumber } from '@/lib/format';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The labels of a deposit (specs/031-device): one per bag or piece the workshop follows, each
// with the deposit's number as a bar code a scanner reads. Outside the frame: only the labels go
// to the printer, one per page of the label printer.
export const Route = createFileRoute('/depots/$orderId/etiquettes')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: async ({ params }) => {
    const [order, work] = await Promise.all([
      fetchOrder({ data: { orderId: params.orderId } }),
      fetchWork({ data: { orderId: params.orderId } }),
    ]);
    return { order, work };
  },
  component: LabelsPage,
});

function LabelsPage() {
  const { me } = Route.useRouteContext();
  const { order, work } = Route.useLoaderData();
  const device = useDevice();
  if (!order) return <EmptyState title={m.error_not_found()} />;
  // What the workshop follows one by one; a deposit it does not follow has one label per line.
  const pieces =
    work && work.units.length > 0
      ? work.units.map((unit) => unit.label)
      : order.items.map((item) =>
          item.pricing === 'per_kg'
            ? `${formatNumber(item.quantity, 3)} kg · ${item.serviceName}`
            : `${formatNumber(item.quantity)} × ${item.articleName ?? item.serviceName}`,
        );
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col gap-4 bg-canvas px-4 py-6 font-ui text-body text-fg print:max-w-none print:p-0">
      <style>{`@media print { @page { size: ${device.labelWidth}mm ${device.labelHeight}mm; margin: 0; } }`}</style>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button onClick={() => window.print()}>{m.labels_print({ count: pieces.length })}</Button>
        <Link
          to="/depots/$orderId"
          params={{ orderId: order.orderId }}
          className="inline-flex h-(--control-height) items-center font-semibold text-fg-link underline"
        >
          {order.number}
        </Link>
      </div>
      <p className="text-body-sm text-fg-muted print:hidden">
        {m.labels_hint({ width: device.labelWidth, height: device.labelHeight })}
      </p>
      <ul className="flex flex-col gap-3 print:gap-0">
        {pieces.map((piece, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the labels of a deposit never move
          <li
            key={index}
            className="flex flex-col justify-between gap-1 rounded-box border border-line bg-white p-3 text-black print:break-after-page print:rounded-none print:border-0 print:p-[2mm]"
            style={{ aspectRatio: `${device.labelWidth} / ${device.labelHeight}` }}
          >
            <p className="flex items-baseline justify-between gap-2">
              <span className="font-number text-title font-semibold">{order.number}</span>
              <span className="font-number text-body-sm">
                {index + 1}/{pieces.length}
              </span>
            </p>
            <p className="truncate text-body-sm font-semibold">{order.customerName}</p>
            <p className="truncate text-body-sm">{piece}</p>
            <Barcode text={order.number} label={m.labels_barcode({ number: order.number })} />
            <p className="flex items-baseline justify-between gap-2 text-[10px]">
              <span className="truncate">{me.business?.businessName ?? m.app_name()}</span>
              <span>{formatDay(order.promisedAt)}</span>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
