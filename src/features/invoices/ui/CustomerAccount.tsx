import { Button, PageSection, Row, RowList, Tag } from '@kete/design';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote } from '@/lib/fields';
import { formatDay, formatMoney } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import { statusOf } from '../domain/invoice';
import { fetchAccount, issueInvoice } from '../functions';
import type { CustomerAccount as Account } from '../invoice.record';
import { invoiceStatusTones, invoiceStatusWords } from './words';

/**
 * A customer's account on her page: what she owes in all, her deposits that are on no invoice —
 * to bill together, a company's month in one gesture — and her invoices.
 */
export function CustomerAccount({ customerId, mayIssue }: { customerId: string; mayIssue: boolean }) {
  const navigate = useNavigate();
  const router = useRouter();
  const [account, setAccount] = useState<Account | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchAccount({ data: { customerId } }).then((read) => {
      if (!alive || !read) return;
      setAccount(read);
      setChosen(new Set(read.uninvoiced.map((order) => order.orderId)));
    });
    return () => {
      alive = false;
    };
  }, [customerId]);

  if (!account) return null;
  const toggle = (orderId: string, on: boolean) =>
    setChosen((current) => {
      const next = new Set(current);
      if (on) next.add(orderId);
      else next.delete(orderId);
      return next;
    });
  const total = account.uninvoiced
    .filter((order) => chosen.has(order.orderId))
    .reduce((sum, order) => sum + order.total, 0);

  async function issue() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await issueInvoice({ data: { orderIds: [...chosen] } });
      if (outcome.ok) {
        await router.invalidate();
        await navigate({ to: '/factures/$invoiceId', params: { invoiceId: outcome.output.invoiceId } });
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
    <PageSection title={m.account_title()}>
      <p className="mb-4">
        <span className="text-fg-muted">{m.account_due()}</span>{' '}
        <span className="font-number text-title font-semibold">{formatMoney(account.due)}</span>
      </p>

      {account.uninvoiced.length > 0 && (
        <div className="mb-6 rounded-box border border-line bg-surface p-4">
          <h3 className="font-semibold">{m.account_uninvoiced()}</h3>
          <ul className="mt-2 flex flex-col">
            {account.uninvoiced.map((order) => (
              <li key={order.orderId}>
                <CheckField
                  label={
                    <span className="flex items-baseline justify-between gap-3">
                      <span>
                        {order.number} · {formatDay(order.createdAt)}
                      </span>
                      <span className="font-number whitespace-nowrap">{formatMoney(order.total)}</span>
                    </span>
                  }
                  checked={chosen.has(order.orderId)}
                  disabled={!mayIssue || busy}
                  onChange={(on) => toggle(order.orderId, on)}
                />
              </li>
            ))}
          </ul>
          {mayIssue && (
            <div className="mt-3 flex flex-col gap-3">
              <ErrorNote>{error}</ErrorNote>
              <Button disabled={busy || chosen.size === 0} onClick={() => void issue()}>
                {m.account_issue({ count: chosen.size, total: formatMoney(total) })}
              </Button>
            </div>
          )}
        </div>
      )}

      {account.invoices.length === 0 ? (
        <p className="text-fg-muted">{m.account_no_invoice()}</p>
      ) : (
        <RowList label={m.nav_invoices()}>
          {account.invoices.map((invoice) => {
            const status = statusOf(invoice);
            return (
              <Row
                key={invoice.invoiceId}
                onClick={() =>
                  void navigate({ to: '/factures/$invoiceId', params: { invoiceId: invoice.invoiceId } })
                }
                title={invoice.number}
                meta={formatDay(invoice.issuedOn)}
                end={
                  <>
                    <span className="font-number">{formatMoney(invoice.total)}</span>
                    {invoice.kind === 'credit' ? (
                      <Tag tone="neutral">{m.invoice_kind_credit()}</Tag>
                    ) : (
                      <Tag tone={invoiceStatusTones[status]}>{invoiceStatusWords[status]()}</Tag>
                    )}
                  </>
                }
              />
            );
          })}
        </RowList>
      )}
    </PageSection>
  );
}
