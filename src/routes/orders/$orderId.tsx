import {
  Button,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  Facts,
  PageHeader,
  PageSection,
  Tag,
  TextField,
} from '@kete/design';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { formatPhone } from '@/features/customers/domain/phone';
import { fetchCounterAccount } from '@/features/accounts/functions';
import { InvoiceLink } from '@/features/invoices/ui/InvoiceLink';
import { OrderDelivery } from '@/features/delivery/ui/OrderDelivery';
import { OrderAsk } from '@/features/manager/ui/OrderAsk';
import type { PaymentMethod } from '@/features/orders';
import { moneyMethods } from '@/features/orders/domain/order';
import {
  cancelOrder,
  collectOrder,
  fetchOrder,
  markReady,
  recordPayment,
  refundPayment,
  storeOrder,
} from '@/features/orders/functions';
import { gestureKey, MoneyFields, wholeAmount } from '@/features/orders/ui/MoneyFields';
import { eventWords, kindWords, methodWords, statusTones, statusWords } from '@/features/orders/ui/words';
import { fetchWork } from '@/features/workshop/functions';
import { OrderWork } from '@/features/workshop/ui/OrderWork';
import { errorSentence } from '@/lib/errors';
import { ErrorNote } from '@/lib/fields';
import { formatDayTime, formatMoney, formatNumber } from '@/lib/format';
import type { Outcome } from '@/lib/rule-error';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// A deposit in full: its real content, its money, its history — and the gestures the person may
// do with it, each one named.
export const Route = createFileRoute('/_app/depots/$orderId')({
  loader: async ({ params }) => {
    const [order, work] = await Promise.all([
      fetchOrder({ data: { orderId: params.orderId } }),
      fetchWork({ data: { orderId: params.orderId } }),
    ]);
    // Her prepaid credit, when she has some: one more way to pay (specs/026-accounts).
    const credit = order ? (await fetchCounterAccount({ data: { customerId: order.customerId } })).credit : 0;
    return { order, work, credit };
  },
  component: OrderPage,
});

type Gesture = 'pay' | 'ready' | 'store' | 'collect' | 'refund' | 'cancel';

function OrderPage() {
  const { me } = Route.useRouteContext();
  const { order, work, credit } = Route.useLoaderData();
  const router = useRouter();
  const [gesture, setGesture] = useState<Gesture | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [text, setText] = useState('');
  const [key, setKey] = useState(() => gestureKey('ord'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  if (!order) return <EmptyState title={m.error_not_found()} />;

  const balance = order.total - order.paid;
  const open = order.status === 'received' || order.status === 'in_progress';
  const units = work?.units ?? [];
  // A deposit with work left becomes ready in the workshop, never by hand.
  const workLeft = units.some((unit) => !unit.finishedAt);
  const start = (next: Gesture) => {
    setError(null);
    setText(next === 'store' ? order.location : '');
    setAmount(next === 'refund' ? String(order.paid) : balance > 0 ? String(balance) : '');
    setGesture(next);
  };

  async function run(work: () => Promise<Outcome<unknown>>) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        setGesture(null);
        setConfirming(false);
        setKey(gestureKey('ord'));
        await router.invalidate();
      } else {
        setConfirming(false);
        setError(
          outcome.code === 'balance_due'
            ? m.error_balance_due({ amount: formatMoney(Number(outcome.facts['amount'] ?? balance)) })
            : errorSentence(outcome.code),
        );
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const money = wholeAmount(amount);
  const submit = () => {
    const { orderId } = order;
    if (gesture === 'pay' && money) {
      return run(() => recordPayment({ data: { key, payment: { orderId, amount: money, method } } }));
    }
    if (gesture === 'ready') return run(() => markReady({ data: { orderId, location: text } }));
    if (gesture === 'store') return run(() => storeOrder({ data: { orderId, location: text } }));
    if (gesture === 'collect') {
      return run(() =>
        collectOrder({
          data: {
            key,
            collection: { orderId, ...(money && balance > 0 ? { payment: { amount: money, method } } : {}) },
          },
        }),
      );
    }
    if (gesture === 'refund' && money) {
      return run(() =>
        refundPayment({ data: { key, refund: { orderId, amount: money, method, reason: text } } }),
      );
    }
    if (gesture === 'cancel') return run(() => cancelOrder({ data: { orderId, reason: text } }));
    setError(m.error_amount());
    return undefined;
  };
  // What cannot be undone asks once more.
  const irreversible = gesture === 'cancel' || gesture === 'refund';
  const titles: Record<Gesture, () => string> = {
    pay: m.action_cash,
    ready: m.action_mark_ready,
    store: m.action_store,
    collect: m.action_hand_over,
    refund: m.action_refund,
    cancel: m.action_cancel_order,
  };

  return (
    <>
      <PageHeader
        breadcrumbLabel={m.nav_label()}
        breadcrumbs={[{ label: m.nav_orders(), href: '/depots' }, { label: order.number }]}
        title={order.number}
        status={
          <span className="flex flex-wrap gap-2">
            <Tag tone={statusTones[order.status]}>{statusWords[order.status]()}</Tag>
            {order.express && <Tag tone="verify">{m.counter_express()}</Tag>}
          </span>
        }
        actions={
          <>
            {order.status === 'ready' && can(me, 'payments:collect') && (
              <Button onClick={() => start('collect')}>
                {balance > 0
                  ? m.action_hand_over_and_cash({ amount: formatMoney(balance) })
                  : m.action_hand_over()}
              </Button>
            )}
            {open && !workLeft && can(me, 'workshop:operate') && (
              <Button onClick={() => start('ready')}>{m.action_mark_ready()}</Button>
            )}
            {order.status === 'ready' && can(me, 'workshop:operate') && (
              <Button variant="secondary" onClick={() => start('store')}>
                {m.action_store()}
              </Button>
            )}
            {order.status !== 'cancelled' && balance > 0 && can(me, 'payments:collect') && (
              <Button variant="secondary" onClick={() => start('pay')}>
                {m.action_cash()}
              </Button>
            )}
            <Link
              to="/depots/$orderId/recu"
              params={{ orderId: order.orderId }}
              className="inline-flex h-(--control-height) items-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover"
            >
              {m.action_receipt()}
            </Link>
            <Link
              to="/depots/$orderId/etiquettes"
              params={{ orderId: order.orderId }}
              className="inline-flex h-(--control-height) items-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover"
            >
              {m.action_labels()}
            </Link>
            {order.status !== 'cancelled' && (
              <InvoiceLink orderId={order.orderId} mayIssue={can(me, 'invoices:issue')} onError={setError} />
            )}
          </>
        }
      />
      {gesture === null && <ErrorNote>{error}</ErrorNote>}

      <Facts
        items={[
          {
            label: m.counter_customer(),
            value: (
              <Link
                to="/clients/$customerId"
                params={{ customerId: order.customerId }}
                className="text-link underline"
              >
                {order.customerName}
              </Link>
            ),
          },
          { label: m.customer_phone(), value: formatPhone(order.customerPhone) },
          { label: m.order_received_on(), value: formatDayTime(order.createdAt) },
          { label: m.order_promised(), value: formatDayTime(order.promisedAt) },
          { label: m.order_total(), value: formatMoney(order.total) },
          { label: m.order_paid(), value: formatMoney(order.paid) },
          { label: m.order_balance(), value: formatMoney(balance) },
          ...(order.location ? [{ label: m.order_location(), value: order.location }] : []),
          ...(order.note ? [{ label: m.counter_note(), value: order.note }] : []),
          ...(order.cancelReason ? [{ label: m.order_cancel_reason(), value: order.cancelReason }] : []),
        ]}
      />

      <PageSection title={m.counter_content()}>
        <DataTable
          caption={m.counter_content()}
          rows={order.items}
          rowKey={(item) => item.itemId}
          columns={[
            {
              key: 'label',
              label: m.order_piece(),
              render: (item) => (
                <>
                  {item.articleName ? `${item.articleName} · ${item.serviceName}` : item.serviceName}
                  {item.defects && (
                    <span className="block text-body-sm text-fg-muted">
                      {m.counter_defects()} : {item.defects}
                    </span>
                  )}
                </>
              ),
            },
            {
              key: 'quantity',
              label: m.order_quantity(),
              align: 'end',
              render: (item) =>
                `${formatNumber(item.quantity, 3)}${item.pricing === 'per_kg' ? ' kg' : ''}`,
            },
            ...(order.packName
              ? [
                  {
                    key: 'covered',
                    label: m.order_covered(),
                    align: 'end' as const,
                    render: (item: (typeof order.items)[number]) => formatNumber(item.covered, 3),
                  },
                ]
              : []),
            { key: 'due', label: m.order_due(), align: 'end', render: (item) => formatMoney(item.due) },
          ]}
        />
        <dl className="mt-3 flex flex-col gap-1 text-fg-muted">
          {order.packName && (
            <Money label={order.packName} value={formatMoney(order.packPrice)} />
          )}
          {order.supplement > 0 && <Money label={m.counter_supplement()} value={formatMoney(order.supplement)} />}
          {order.expressAmount > 0 && <Money label={m.counter_express()} value={formatMoney(order.expressAmount)} />}
          {order.storageAmount > 0 && <Money label={m.invoice_line_storage()} value={formatMoney(order.storageAmount)} />}
          {order.deliveryAmount > 0 && <Money label={m.invoice_line_delivery()} value={formatMoney(order.deliveryAmount)} />}
          {order.discount > 0 && (
            <Money
              label={`${m.counter_discount()} — ${order.discountReason}`}
              value={`− ${formatMoney(order.discount)}`}
            />
          )}
        </dl>
      </PageSection>

      {units.length > 0 && (
        <PageSection title={m.nav_workshop()}>
          <OrderWork units={units} incidents={work?.incidents ?? []} />
        </PageSection>
      )}

      <PageSection title={m.order_payments()}>
        {order.payments.length === 0 ? (
          <p className="text-fg-muted">{m.order_no_payment()}</p>
        ) : (
          <DataTable
            caption={m.order_payments()}
            rows={order.payments}
            rowKey={(payment) => payment.paymentId}
            columns={[
              { key: 'at', label: m.journal_when(), render: (p) => formatDayTime(p.createdAt) },
              {
                key: 'kind',
                label: m.order_payment_kind(),
                render: (p) => (
                  <>
                    {kindWords[p.kind]()} · {methodWords[p.method]()}
                    {p.reason && <span className="block text-body-sm text-fg-muted">{p.reason}</span>}
                  </>
                ),
              },
              {
                key: 'amount',
                label: m.money_amount(),
                align: 'end',
                render: (p) => `${p.kind === 'refund' ? '− ' : ''}${formatMoney(p.amount)}`,
              },
            ]}
          />
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          {order.paid > 0 && can(me, 'payments:refund') && (
            <Button variant="secondary" onClick={() => start('refund')}>
              {m.action_refund()}
            </Button>
          )}
          {open && can(me, 'orders:cancel') && (
            <Button variant="secondary" onClick={() => start('cancel')}>
              {m.action_cancel_order()}
            </Button>
          )}
        </div>
      </PageSection>

      {can(me, 'delivery:read') && order.status !== 'cancelled' && (
        <OrderDelivery orderId={order.orderId} open={open || order.status === 'ready'} mayPlan={can(me, 'delivery:plan')} />
      )}

      <OrderAsk
        orderId={order.orderId}
        mayAsk={order.status !== 'cancelled' && can(me, 'approvals:request')}
        mayComplain={can(me, 'complaints:open')}
      />

      <PageSection title={m.order_history()}>
        <ol className="flex flex-col gap-2">
          {order.events.map((event, index) => (
            <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-number text-body-sm text-fg-muted">{formatDayTime(event.at)}</span>
              <span className="font-semibold">{(eventWords[event.kind] ?? (() => event.kind))()}</span>
              {typeof event.detail['amount'] === 'number' && (
                <span className="font-number">{formatMoney(event.detail['amount'])}</span>
              )}
              {typeof event.detail['reason'] === 'string' && (
                <span className="text-fg-muted">{event.detail['reason']}</span>
              )}
              {event.actorKind !== 'person' && <Tag tone="agent">{m.journal_agent()}</Tag>}
            </li>
          ))}
        </ol>
      </PageSection>

      <Drawer
        open={gesture !== null}
        onClose={() => setGesture(null)}
        title={gesture ? titles[gesture]() : ''}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setGesture(null)}>
              {m.action_close()}
            </Button>
            <Button
              disabled={
                busy ||
                ((gesture === 'cancel' || gesture === 'refund' || gesture === 'store') && !text.trim())
              }
              onClick={() => (irreversible ? setConfirming(true) : void submit())}
            >
              {gesture ? titles[gesture]() : ''}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {(gesture === 'pay' || gesture === 'refund' || (gesture === 'collect' && balance > 0)) && (
            <MoneyFields
              amount={amount}
              method={method}
              hint={
                gesture === 'refund'
                  ? m.order_refund_hint({ amount: formatMoney(order.paid) })
                  : m.order_balance_of({ amount: formatMoney(balance) })
              }
              methods={credit > 0 || gesture === 'refund' ? [...moneyMethods, 'credit'] : moneyMethods}
              onAmount={setAmount}
              onMethod={setMethod}
            />
          )}
          {credit > 0 && (gesture === 'pay' || (gesture === 'collect' && balance > 0)) && (
            <p className="text-body-sm text-fg-muted">{m.counter_credit({ amount: formatMoney(credit) })}</p>
          )}
          {gesture === 'collect' && balance === 0 && <p>{m.order_collect_paid()}</p>}
          {gesture === 'collect' && balance > 0 && can(me, 'orders:release_unpaid') && (
            <p className="text-body-sm text-fg-muted">{m.order_collect_unpaid_hint()}</p>
          )}
          {(gesture === 'ready' || gesture === 'store') && (
            <TextField
              label={m.order_location()}
              hint={m.order_location_hint()}
              value={text}
              maxLength={60}
              onChange={(event) => setText(event.target.value)}
            />
          )}
          {(gesture === 'cancel' || gesture === 'refund') && (
            <TextField
              label={m.order_reason()}
              value={text}
              maxLength={300}
              onChange={(event) => setText(event.target.value)}
            />
          )}
          <ErrorNote>{error}</ErrorNote>
        </div>
      </Drawer>
      <ConfirmDialog
        open={confirming}
        title={m.review_confirm_title()}
        confirmLabel={gesture ? titles[gesture]() : ''}
        cancelLabel={m.action_close()}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(false)}
      >
        {gesture === 'refund'
          ? m.order_confirm_refund({ amount: formatMoney(money ?? 0), number: order.number })
          : m.order_confirm_cancel({ number: order.number })}
      </ConfirmDialog>
    </>
  );
}

function Money({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt>{label}</dt>
      <dd className="font-number whitespace-nowrap">{value}</dd>
    </div>
  );
}
