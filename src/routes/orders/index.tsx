import { Button, EmptyState, PageHeader, Row, RowList, Tabs, Tag, TextField } from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { fetchOrders } from '@/features/orders/functions';
import { statusTones, statusWords } from '@/features/orders/ui/words';
import { formatDayTime, formatMoney } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

const search = z.object({
  etape: z.enum(['open', 'ready', 'closed', 'all']).default('open'),
  q: z.string().trim().max(120).optional(),
});

// The deposits, by stage: what is still to process first, the soonest promised on top.
export const Route = createFileRoute('/_app/depots')({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search: { etape, q } }) => ({ etape, q }),
  loader: ({ deps }) => fetchOrders({ data: { stage: deps.etape, ...(deps.q ? { text: deps.q } : {}) } }),
  component: OrdersPage,
});

function OrdersPage() {
  const { me } = Route.useRouteContext();
  const orders = Route.useLoaderData();
  const { etape, q } = Route.useSearch();
  const navigate = useNavigate();
  const [text, setText] = useState(q ?? '');
  if (!orders) return <EmptyState title={m.error_not_allowed()} />;
  const go = (next: { etape?: typeof etape; q?: string | undefined }) =>
    void navigate({ to: '/depots', search: { etape, ...(q ? { q } : {}), ...next } });
  return (
    <>
      <PageHeader
        title={m.nav_orders()}
        actions={
          can(me, 'orders:create') ? (
            <Button onClick={() => void navigate({ to: '/depots/nouveau' })}>{m.nav_new_order()}</Button>
          ) : undefined
        }
      />
      <form
        className="mb-4 flex items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          go({ q: text.trim() || undefined });
        }}
      >
        <TextField
          className="flex-1"
          label={m.orders_search()}
          type="search"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <Button variant="secondary" type="submit">
          {m.action_search()}
        </Button>
      </form>
      <Tabs
        label={m.nav_orders()}
        current={etape}
        onSelect={(key) => go({ etape: key as typeof etape })}
        items={[
          { key: 'open', label: m.orders_stage_open() },
          { key: 'ready', label: m.orders_stage_ready() },
          { key: 'closed', label: m.orders_stage_closed() },
          { key: 'all', label: m.orders_stage_all() },
        ]}
      />
      {orders.length === 0 ? (
        <EmptyState title={m.orders_empty_title()}>{m.orders_empty_body()}</EmptyState>
      ) : (
        <RowList label={m.nav_orders()}>
          {orders.map((order) => (
            <Row
              key={order.orderId}
              onClick={() => void navigate({ to: '/depots/$orderId', params: { orderId: order.orderId } })}
              title={`${order.number} · ${order.customerName}`}
              meta={
                <span className="flex flex-wrap items-center gap-2">
                  <Tag tone={statusTones[order.status]}>{statusWords[order.status]()}</Tag>
                  {order.express && <Tag tone="verify">{m.counter_express()}</Tag>}
                  <span>{formatDayTime(order.promisedAt)}</span>
                </span>
              }
              end={
                <span className="text-right font-number">
                  <span className="block">{formatMoney(order.total)}</span>
                  <span className="block text-body-sm text-fg-muted">
                    {order.total - order.paid > 0
                      ? m.order_balance_of({ amount: formatMoney(order.total - order.paid) })
                      : m.order_paid_in_full()}
                  </span>
                </span>
              }
            />
          ))}
        </RowList>
      )}
    </>
  );
}
