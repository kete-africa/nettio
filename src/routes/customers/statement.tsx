import { Button, EmptyState } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { fetchCounterAccount } from '@/features/accounts/functions';
import { fetchBusiness } from '@/features/business/functions';
import { formatPhone } from '@/features/customers/domain/phone';
import { fetchCustomer } from '@/features/customers/functions';
import { statusOf } from '@/features/invoices/domain/invoice';
import { fetchAccount } from '@/features/invoices/functions';
import { invoiceStatusWords } from '@/features/invoices/ui/words';
import { formatDay, formatMoney } from '@/lib/format';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// A customer's statement of account (specs/032-account-statement): every invoice and every deposit
// not billed yet, what was paid on each, what is still owed. Outside the frame: only the
// document goes to the printer, or to the company's accountant.
export const Route = createFileRoute('/clients/$customerId/releve')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: async ({ params }) => {
    const data = { customerId: params.customerId };
    const [customer, account, business, counter] = await Promise.all([
      fetchCustomer({ data }),
      fetchAccount({ data }),
      fetchBusiness(),
      fetchCounterAccount({ data }),
    ]);
    return { customer, account, business, credit: counter.credit };
  },
  component: StatementPage,
});

function StatementPage() {
  const { customer, account, business, credit } = Route.useLoaderData();
  if (!customer || !account) return <EmptyState title={m.error_not_found()} />;
  // What an invoice still claims: nothing once a credit note cancelled it; a credit note claims nothing.
  const lines = account.invoices.map((invoice) => {
    const open = invoice.kind === 'invoice' && !invoice.credited;
    return {
      id: invoice.invoiceId,
      label:
        invoice.kind === 'credit'
          ? m.invoice_credit_title({ number: invoice.number })
          : m.invoice_title({ number: invoice.number }),
      day: invoice.issuedOn,
      state: invoice.kind === 'credit' ? m.invoice_kind_credit() : invoiceStatusWords[statusOf(invoice)](),
      total: invoice.total,
      paid: open ? invoice.paid : 0,
      due: open ? invoice.total - invoice.paid : 0,
    };
  });
  const unbilled = account.uninvoiced.map((order) => ({
    id: order.orderId,
    label: m.statement_deposit({ number: order.number }),
    day: order.createdAt,
    state: m.statement_not_invoiced(),
    total: order.total,
    paid: order.paid,
    due: order.total - order.paid,
  }));
  const all = [...lines, ...unbilled];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-5 bg-canvas px-4 py-6 font-ui text-body text-fg">
      <article className="rounded-box border border-line bg-surface p-5 print:border-0 print:p-0">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <p className="font-heading text-title font-semibold">{business?.settings?.businessName ?? m.app_name()}</p>
          <div className="text-right">
            <h1 className="font-heading text-title font-semibold">{m.statement_account_title()}</h1>
            <p className="text-body-sm text-fg-muted">{formatDay(new Date())}</p>
          </div>
        </header>
        <p className="text-body-sm text-fg-muted">{m.invoice_customer()}</p>
        <p className="font-semibold">{customer.name}</p>
        <p className="mb-4 font-number text-body-sm text-fg-muted">{formatPhone(customer.phone)}</p>
        {all.length === 0 ? (
          <p className="text-fg-muted">{m.statement_account_empty()}</p>
        ) : (
          <ul className="border-y border-line py-2">
            {all.map((line) => (
              <li key={line.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-1.5">
                <span className="min-w-0">
                  <span className="font-semibold">{line.label}</span>
                  <span className="block text-body-sm text-fg-muted">
                    {formatDay(line.day)} · {line.state}
                  </span>
                </span>
                <span className="text-right font-number">
                  <span className="block">{formatMoney(line.total)}</span>
                  <span className="block text-body-sm text-fg-muted">
                    {line.due > 0 ? m.order_balance_of({ amount: formatMoney(line.due) }) : m.statement_nothing_due()}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-3 flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 font-semibold">
            <dt>{m.account_due()}</dt>
            <dd className="font-number">{formatMoney(account.due)}</dd>
          </div>
          {credit > 0 && (
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-fg-muted">{m.statement_credit_held()}</dt>
              <dd className="font-number">{formatMoney(credit)}</dd>
            </div>
          )}
        </dl>
        <p className="mt-4 text-body-sm text-fg-muted">{m.statement_account_how()}</p>
      </article>
      <div className="flex flex-wrap gap-3 print:hidden">
        <Button variant="secondary" onClick={() => window.print()}>
          {m.quote_print()}
        </Button>
        <a
          className="inline-flex h-(--control-height) items-center font-semibold text-fg-link underline"
          href={`/clients/${customer.customerId}`}
        >
          {customer.name}
        </a>
      </div>
    </main>
  );
}
