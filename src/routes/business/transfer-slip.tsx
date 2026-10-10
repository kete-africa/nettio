import { Button, EmptyState, Tag } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { fetchBusiness } from '@/features/business/functions';
import { fetchTransfer } from '@/features/network/functions';
import { formatDayTime, formatNumber } from '@/lib/format';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// A transfer's slip stands outside the frame: it travels with the bags, and is checked on arrival.
export const Route = createFileRoute('/transferts/$transferId')({
  beforeLoad: async ({ location }) => requirePerson(location.href),
  loader: async ({ params }) => {
    const [transfer, business] = await Promise.all([
      fetchTransfer({ data: { transferId: params.transferId } }),
      fetchBusiness(),
    ]);
    return { transfer, business };
  },
  component: TransferSlipPage,
});

function TransferSlipPage() {
  const { transfer, business } = Route.useLoaderData();
  if (!transfer) return <EmptyState title={m.error_not_found()} />;
  const done = transfer.status === 'received';
  const pieces = transfer.lines.reduce((sum, line) => sum + line.pieces, 0);
  const kilos = transfer.lines.reduce((sum, line) => sum + line.kilos, 0);
  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-5 bg-canvas px-4 py-6 font-ui text-body text-fg">
      <article className="rounded-box border border-line bg-surface p-5 print:border-0 print:p-0">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <p className="font-heading text-title font-semibold">{business?.settings?.businessName ?? m.app_name()}</p>
          <div className="text-right">
            <h1 className="font-heading text-title font-semibold">{m.transfers_slip({ number: transfer.number })}</h1>
            <p className="text-body-sm text-fg-muted">{formatDayTime(transfer.sentAt)}</p>
            <p className="mt-1 print:hidden">
              <Tag tone={done ? 'validated' : 'neutral'}>{done ? m.transfers_status_received() : m.transfers_status_sent()}</Tag>
            </p>
          </div>
        </header>
        <p className="mb-4 font-semibold">{m.transfers_route({ from: transfer.fromName, to: transfer.toName })}</p>
        {transfer.note && <p className="mb-4 text-body-sm">{transfer.note}</p>}
        <ul className="border-y border-line py-2">
          {transfer.lines.map((line) => (
            <li key={line.orderId} className="flex items-baseline justify-between gap-3 py-1">
              <span className="min-w-0">
                <span className="font-semibold">{line.number}</span> · {line.customerName}
                <span className="block text-body-sm text-fg-muted">
                  {m.transfers_content({ pieces: formatNumber(line.pieces), kilos: formatNumber(line.kilos, 1) })}
                </span>
              </span>
              <span className="text-body-sm">
                {done ? (
                  line.received ? (
                    m.transfers_line_received()
                  ) : (
                    m.transfers_line_missing()
                  )
                ) : (
                  // An empty box to tick by hand when the bags arrive.
                  <span className="inline-block size-4 border border-line-strong" aria-hidden="true" />
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-3 font-semibold">
          {m.transfers_totals({
            deposits: formatNumber(transfer.lines.length),
            pieces: formatNumber(pieces),
            kilos: formatNumber(kilos, 1),
          })}
        </p>
        {transfer.receivedAt && (
          <p className="mt-2 text-body-sm text-fg-muted">{m.transfers_received_at({ date: formatDayTime(transfer.receivedAt) })}</p>
        )}
        {transfer.receptionNote && <p className="mt-2 text-body-sm">{transfer.receptionNote}</p>}
        <div className="mt-6 grid grid-cols-2 gap-6 text-body-sm">
          <div>
            <p className="text-fg-muted">{m.transfers_sign_sender()}</p>
            <p className="mt-1 min-h-10 border-b border-line" />
          </div>
          <div>
            <p className="text-fg-muted">{m.transfers_sign_receiver()}</p>
            <p className="mt-1 min-h-10 border-b border-line" />
          </div>
        </div>
      </article>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          {m.quote_print()}
        </Button>
        <a className="inline-flex h-(--control-height) items-center font-semibold text-fg-link underline" href="/pressing/reseau">
          {m.nav_network()}
        </a>
      </div>
    </main>
  );
}
