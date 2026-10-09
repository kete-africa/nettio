import {
  Button,
  Drawer,
  EmptyState,
  Facts,
  PageHeader,
  PageSection,
  Row,
  RowList,
  Tag,
  TextField,
} from '@kete/design';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { Customer, CustomerChannel } from '@/features/customers';
import { customerChannels } from '@/features/customers/customer.record';
import { formatPhone } from '@/features/customers/domain/phone';
import { fetchCustomer, saveCustomer } from '@/features/customers/functions';
import { CustomerAccount } from '@/features/invoices/ui/CustomerAccount';
import { fetchOrders } from '@/features/orders/functions';
import { statusTones, statusWords } from '@/features/orders/ui/words';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote, SelectField } from '@/lib/fields';
import { formatDay, formatMoney } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// A customer: how the laundry reaches her, what she prefers, and her deposits.
export const Route = createFileRoute('/_app/clients/$customerId')({
  loader: async ({ params }) => ({
    customer: await fetchCustomer({ data: { customerId: params.customerId } }),
    orders: await fetchOrders({ data: { stage: 'all', customerId: params.customerId } }),
  }),
  component: CustomerPage,
});

const channelWords: Record<CustomerChannel, () => string> = {
  whatsapp: m.channel_whatsapp,
  telegram: m.channel_telegram,
  sms: m.channel_sms,
  none: m.channel_none,
};

function CustomerPage() {
  const { me } = Route.useRouteContext();
  const { customer, orders } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Customer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!customer) return <EmptyState title={m.error_not_found()} />;
  const owed = (orders ?? [])
    .filter((order) => order.status !== 'cancelled')
    .reduce((sum, order) => sum + order.total - order.paid, 0);

  async function submit() {
    if (!draft) return;
    setBusy(true);
    try {
      const outcome = await saveCustomer({ data: draft });
      if (outcome.ok) {
        setDraft(null);
        await router.invalidate();
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbLabel={m.nav_label()}
        breadcrumbs={[{ label: m.nav_customers(), href: '/clients' }, { label: customer.name }]}
        title={customer.name}
        actions={
          can(me, 'customers:write') ? (
            <Button
              variant="secondary"
              onClick={() => {
                setError(null);
                setDraft({ ...customer });
              }}
            >
              {m.action_change()}
            </Button>
          ) : undefined
        }
      />
      <Facts
        items={[
          { label: m.customer_phone(), value: formatPhone(customer.phone) },
          {
            label: m.customer_channel(),
            value: customer.consent ? channelWords[customer.channel]() : m.customer_no_messages(),
          },
          { label: m.customer_owes(), value: formatMoney(owed) },
          { label: m.customer_since(), value: formatDay(customer.createdAt) },
          ...(customer.preferences
            ? [{ label: m.customer_preferences(), value: customer.preferences }]
            : []),
          ...(customer.note ? [{ label: m.counter_note(), value: customer.note }] : []),
        ]}
      />
      <PageSection title={m.nav_orders()}>
        {!orders || orders.length === 0 ? (
          <p className="text-fg-muted">{m.orders_empty_title()}</p>
        ) : (
          <RowList label={m.nav_orders()}>
            {orders.map((order) => (
              <Row
                key={order.orderId}
                onClick={() =>
                  void navigate({ to: '/depots/$orderId', params: { orderId: order.orderId } })
                }
                title={order.number}
                meta={
                  <span className="flex flex-wrap items-center gap-2">
                    <Tag tone={statusTones[order.status]}>{statusWords[order.status]()}</Tag>
                    <span>{formatDay(order.createdAt)}</span>
                  </span>
                }
                end={<span className="font-number">{formatMoney(order.total)}</span>}
              />
            ))}
          </RowList>
        )}
      </PageSection>
      {can(me, 'invoices:read') && (
        <CustomerAccount customerId={customer.customerId} mayIssue={can(me, 'invoices:issue')} />
      )}

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={m.action_change()}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button disabled={busy || !draft?.name.trim()} onClick={() => void submit()}>
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <TextField
              label={m.customer_name()}
              value={draft.name}
              maxLength={120}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <TextField
              label={m.customer_phone()}
              type="tel"
              value={draft.phone}
              onChange={(event) => setDraft({ ...draft, phone: event.target.value })}
            />
            <SelectField
              label={m.customer_channel()}
              value={draft.channel}
              onChange={(event) =>
                setDraft({ ...draft, channel: event.target.value as CustomerChannel })
              }
              options={customerChannels.map((value) => ({ value, label: channelWords[value]() }))}
            />
            <CheckField
              label={m.customer_consent()}
              hint={m.customer_consent_hint()}
              checked={draft.consent}
              onChange={(consent) => setDraft({ ...draft, consent })}
            />
            <TextField
              label={m.customer_preferences()}
              hint={m.customer_preferences_hint()}
              value={draft.preferences}
              maxLength={300}
              onChange={(event) => setDraft({ ...draft, preferences: event.target.value })}
            />
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>
    </>
  );
}
