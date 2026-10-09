import { useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { errorSentence } from '@/lib/errors';
import * as m from '@/paraglide/messages.js';
import { fetchInvoiceOfOrder, issueInvoice } from '../functions';

const linkClass =
  'inline-flex h-(--control-height) items-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover disabled:opacity-60';

/**
 * On a deposit's page: its invoice when it has one, or the gesture that makes it — an invoice on
 * demand. Nothing is shown to who may not read invoices.
 */
export function InvoiceLink({
  orderId,
  mayIssue,
  onError,
}: {
  orderId: string;
  mayIssue: boolean;
  onError: (sentence: string) => void;
}) {
  const navigate = useNavigate();
  const [state, setState] = useState<{ invoice: { invoiceId: string; number: string } | null } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void fetchInvoiceOfOrder({ data: { orderId } }).then((read) => {
      if (alive && read.allowed) setState({ invoice: read.invoice });
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  if (!state) return null;
  const { invoice } = state;
  if (invoice) {
    return (
      <button
        type="button"
        className={linkClass}
        onClick={() => void navigate({ to: '/factures/$invoiceId', params: { invoiceId: invoice.invoiceId } })}
      >
        {m.invoice_title({ number: invoice.number })}
      </button>
    );
  }
  if (!mayIssue) return null;
  return (
    <button
      type="button"
      className={linkClass}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        void issueInvoice({ data: { orderIds: [orderId] } })
          .then((outcome) =>
            outcome.ok
              ? navigate({ to: '/factures/$invoiceId', params: { invoiceId: outcome.output.invoiceId } })
              : onError(errorSentence(outcome.code)),
          )
          .catch(() => onError(m.error_generic()))
          .finally(() => setBusy(false));
      }}
    >
      {m.invoice_issue()}
    </button>
  );
}
