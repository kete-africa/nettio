import { Button, ConfirmDialog, PageSection } from '@kete/design';
import { useRouter } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note } from '@/lib/fields';
import { currentMonth, formatMoney, formatMonth, shiftMonth } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import { fetchMonthPreview, runMonth } from '../functions';

type Preview = NonNullable<Awaited<ReturnType<typeof fetchMonthPreview>>>;

/**
 * The month's invoices of the customers invoiced monthly (specs/026-accounts): who, how many
 * deposits — then one gesture issues them all, each like an invoice made by hand.
 */
export function MonthRun({ mayIssue }: { mayIssue: boolean }) {
  const router = useRouter();
  const [month, setMonth] = useState(() => shiftMonth(currentMonth(), -1));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchMonthPreview({ data: { month } }).then((read) => {
      if (alive) setPreview(read);
    });
    return () => {
      alive = false;
    };
  }, [month]);

  if (!preview || preview.customers.length === 0) return null;
  const waiting = preview.customers.filter((customer) => customer.orders > 0);

  async function run() {
    setConfirming(false);
    setBusy(true);
    setError(null);
    try {
      const outcome = await runMonth({ data: { month } });
      if (outcome.ok) {
        await router.invalidate();
        setPreview(await fetchMonthPreview({ data: { month } }));
        setSaid(
          m.month_run_done({
            count: outcome.output.issued.length,
            total: formatMoney(outcome.output.issued.reduce((sum, invoice) => sum + invoice.total, 0)),
          }),
        );
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
    <PageSection title={m.month_run_title()}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => setMonth(shiftMonth(month, -1))}>
          {m.month_previous()}
        </Button>
        <span className="font-heading text-title font-semibold">{formatMonth(month)}</span>
        <Button variant="secondary" disabled={month >= currentMonth()} onClick={() => setMonth(shiftMonth(month, 1))}>
          {m.month_next()}
        </Button>
      </div>
      <div className="mb-3 flex flex-col gap-3 empty:hidden" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>
      <ul className="flex flex-col divide-y divide-line rounded-box border border-line bg-surface">
        {preview.customers.map((customer) => (
          <li key={customer.customerId} className="flex flex-wrap items-baseline justify-between gap-x-4 px-4 py-3">
            <span className="font-semibold">{customer.name}</span>
            <span className="text-body-sm text-fg-muted">
              {customer.orders > 0 ? m.month_run_orders({ count: customer.orders }) : m.month_run_nothing()}
            </span>
          </li>
        ))}
      </ul>
      {mayIssue && waiting.length > 0 && (
        <div className="mt-3">
          <Button disabled={busy} onClick={() => setConfirming(true)}>
            {m.month_run_issue({ count: waiting.length })}
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={confirming}
        title={m.review_confirm_title()}
        confirmLabel={m.month_run_issue({ count: waiting.length })}
        cancelLabel={m.action_close()}
        onCancel={() => setConfirming(false)}
        onConfirm={() => void run()}
      >
        {m.month_run_confirm({ count: waiting.length, month: formatMonth(month) })}
      </ConfirmDialog>
    </PageSection>
  );
}
