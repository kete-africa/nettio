import { Button, EmptyState, Tag, TextField } from '@kete/design';
import { createFileRoute, Link, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { formatPhone } from '@/features/customers/domain/phone';
import { cashInvoice, creditInvoice, fetchInvoice } from '@/features/invoices/functions';
import { invoiceMessage, invoiceStatusTones, invoiceStatusWords, lineWords } from '@/features/invoices/ui/words';
import type { PaymentMethod } from '@/features/orders';
import { gestureKey, MoneyFields, wholeAmount } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note } from '@/lib/fields';
import { formatDay, formatMoney } from '@/lib/format';
import type { Outcome } from '@/lib/rule-error';
import { can, requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// An invoice or a credit note (specs/019-invoices): the document as it was written, to print or
// to send, and its two gestures — cashing what is due, cancelling it with a credit note. It stands
// outside the app's frame: only the document goes to the printer.
export const Route = createFileRoute('/factures/$invoiceId')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: ({ params }) => fetchInvoice({ data: { invoiceId: params.invoiceId } }),
  component: InvoicePage,
});

const linkClass =
  'inline-flex h-(--control-height) items-center justify-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover';

function InvoicePage() {
  const { me } = Route.useRouteContext();
  const view = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [gesture, setGesture] = useState<'cash' | 'credit' | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => gestureKey('inv'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!view) return <EmptyState title={m.error_not_found()} />;
  const { invoice, status, due } = view;
  const isCredit = invoice.kind === 'credit';
  const { seller } = invoice;
  const digits = invoice.customerPhone.replace(/\D/g, '');
  const message = invoiceMessage(invoice, due);

  async function run<T>(work: () => Promise<Outcome<T>>, after: (output: T) => void | Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        setGesture(null);
        await router.invalidate();
        await after(outcome.output);
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const cash = () => {
    const value = wholeAmount(amount);
    if (value === null) return setError(m.error_amount());
    return void run(
      () => cashInvoice({ data: { invoiceId: invoice.invoiceId, amount: value, method, key } }),
      (output) => {
        setKey(gestureKey('inv'));
        setSaid(
          output.due > 0
            ? m.invoice_cashed_due({ amount: formatMoney(value), due: formatMoney(output.due) })
            : m.invoice_cashed_paid({ amount: formatMoney(value) }),
        );
      },
    );
  };

  return (
    <main className="mx-auto flex min-h-dvh max-w-[640px] flex-col gap-5 bg-canvas px-4 py-6 font-ui text-body text-fg">
      <article className="rounded-box border border-line bg-surface p-5 print:border-0 print:p-0">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-heading text-title font-semibold">{seller.legalName || seller.name}</p>
            {seller.address && <p className="text-body-sm whitespace-pre-line text-fg-muted">{seller.address}</p>}
            {(seller.taxId || seller.tradeRegister) && (
              <p className="text-body-sm text-fg-muted">
                {[
                  seller.taxId && m.invoice_tax_id({ id: seller.taxId }),
                  seller.tradeRegister && m.invoice_trade_register({ id: seller.tradeRegister }),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
          </div>
          <div className="text-right">
            <h1 className="font-heading text-title font-semibold">
              {isCredit ? m.invoice_credit_title({ number: invoice.number }) : m.invoice_title({ number: invoice.number })}
            </h1>
            <p className="text-body-sm text-fg-muted">{formatDay(invoice.issuedOn)}</p>
            {invoice.dueOn && (
              <p className="text-body-sm text-fg-muted">{m.invoice_due_on({ day: formatDay(invoice.dueOn) })}</p>
            )}
            <p className="mt-1 print:hidden">
              <Tag tone={isCredit ? 'neutral' : invoiceStatusTones[status]}>
                {isCredit ? m.invoice_kind_credit() : invoiceStatusWords[status]()}
              </Tag>
            </p>
          </div>
        </header>

        <p className="text-body-sm text-fg-muted">{m.invoice_customer()}</p>
        <p className="font-semibold">{invoice.customerName}</p>
        {invoice.customerMentions.split('\n').filter(Boolean).map((line) => (
          <p key={line} className="text-body-sm text-fg-muted">
            {line}
          </p>
        ))}
        <p className="mb-4 font-number text-body-sm text-fg-muted">{formatPhone(invoice.customerPhone)}</p>

        {isCredit && invoice.creditsInvoiceId && (
          <p className="mb-4 text-body-sm">
            {m.invoice_credits({ number: invoice.creditsNumber ?? '' })} {invoice.reason}
          </p>
        )}

        <ul className="border-y border-line py-2">
          {invoice.lines.map((line, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: the lines of a written invoice never move
            <li key={index} className="flex items-baseline justify-between gap-3 py-1">
              <span className="min-w-0">
                {lineWords(line)}
                {line.covered && (
                  <span className="block text-body-sm text-fg-muted">{m.invoice_line_covered()}</span>
                )}
              </span>
              <span className="font-number whitespace-nowrap">{formatMoney(line.amount)}</span>
            </li>
          ))}
        </ul>

        <dl className="mt-3 flex flex-col gap-1">
          {invoice.vatPercent > 0 && (
            <>
              <Line label={m.invoice_net()} value={formatMoney(invoice.net)} />
              <Line label={m.invoice_vat({ percent: invoice.vatPercent })} value={formatMoney(invoice.vat)} />
            </>
          )}
          <Line strong label={m.order_total()} value={formatMoney(invoice.total)} />
          {!isCredit && !invoice.credited && (
            <>
              <Line label={m.order_paid()} value={formatMoney(invoice.paid)} />
              <div className="flex items-baseline justify-between gap-3 font-semibold">
                <dt>{m.invoice_due()}</dt>
                <dd className="font-number text-[28px] leading-tight whitespace-nowrap">{formatMoney(due)}</dd>
              </div>
            </>
          )}
        </dl>
        {invoice.vatPercent === 0 && <p className="mt-3 text-body-sm text-fg-muted">{m.invoice_no_vat()}</p>}
        {seller.footer && <p className="mt-3 text-body-sm whitespace-pre-line text-fg-muted">{seller.footer}</p>}
      </article>

      <div className="flex flex-col gap-3 print:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        {invoice.credited && invoice.creditedBy && (
          <Note>
            {m.invoice_credited_by({ number: invoice.creditedByNumber ?? '' })}{' '}
            <Link to="/factures/$invoiceId" params={{ invoiceId: invoice.creditedBy }} className="underline">
              {m.invoice_open()}
            </Link>
          </Note>
        )}
        {isCredit && invoice.creditsInvoiceId && (
          <Link to="/factures/$invoiceId" params={{ invoiceId: invoice.creditsInvoiceId }} className={linkClass}>
            {m.invoice_open_credited({ number: invoice.creditsNumber ?? '' })}
          </Link>
        )}

        {gesture === 'cash' && (
          <div className="rounded-box border border-line bg-surface p-4">
            <MoneyFields
              amount={amount}
              method={method}
              hint={m.invoice_cash_hint({ due: formatMoney(due) })}
              onAmount={setAmount}
              onMethod={setMethod}
            />
            <div className="mt-4 flex flex-col gap-3">
              <ErrorNote>{error}</ErrorNote>
              <Button disabled={busy} onClick={cash}>
                {m.invoice_cash_confirm()}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setGesture(null)}>
                {m.action_cancel()}
              </Button>
            </div>
          </div>
        )}
        {gesture === 'credit' && (
          <div className="rounded-box border border-line bg-surface p-4">
            <p className="mb-3 text-body-sm text-fg-muted">{m.invoice_credit_hint()}</p>
            <TextField
              label={m.invoice_credit_reason()}
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="mt-4 flex flex-col gap-3">
              <ErrorNote>{error}</ErrorNote>
              <Button
                disabled={busy || reason.trim() === ''}
                onClick={() =>
                  void run(
                    () => creditInvoice({ data: { invoiceId: invoice.invoiceId, reason } }),
                    (output) => navigate({ to: '/factures/$invoiceId', params: { invoiceId: output.invoiceId } }),
                  )
                }
              >
                {m.invoice_credit_confirm()}
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setGesture(null)}>
                {m.action_cancel()}
              </Button>
            </div>
          </div>
        )}

        {gesture === null && (
          <>
            <ErrorNote>{error}</ErrorNote>
            {!isCredit && !invoice.credited && due > 0 && can(me, 'payments:collect') && (
              <Button
                onClick={() => {
                  setError(null);
                  setAmount(String(due));
                  setGesture('cash');
                }}
              >
                {m.invoice_cash({ due: formatMoney(due) })}
              </Button>
            )}
            <Button variant="secondary" onClick={() => window.print()}>
              {m.invoice_print()}
            </Button>
            <a
              className={linkClass}
              target="_blank"
              rel="noopener noreferrer"
              href={`https://wa.me/${digits}?text=${encodeURIComponent(message)}`}
            >
              {m.receipt_send_whatsapp()}
            </a>
            <a className={linkClass} target="_blank" rel="noopener noreferrer" href={`https://t.me/+${digits}`}>
              {m.receipt_open_telegram()}
            </a>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(message)}>
              {m.receipt_copy()}
            </Button>
            {!isCredit && !invoice.credited && can(me, 'invoices:credit') && (
              <button
                type="button"
                className="self-center py-2 text-link underline"
                onClick={() => {
                  setError(null);
                  setGesture('credit');
                }}
              >
                {m.invoice_credit()}
              </button>
            )}
          </>
        )}
        <Link to="/factures" className="text-center text-link underline">
          {m.invoice_back()}
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
