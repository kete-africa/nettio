import { Button, ConfirmDialog } from '@kete/design';
import { useRouter } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { receiveOrder } from '@/features/orders/functions';
import { errorSentence } from '@/lib/errors';
import { formatDayTime, formatMoney } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import { isNetworkFailure, toRetry, withError, withoutPending } from '../domain/pending';
import { readPending, savePending, usePending } from './device';

/**
 * The deposits this device kept while the network was away (specs/031-device): sent by
 * themselves when it returns, each one once. One a rule refuses waits for a person, with why.
 */
export function PendingDeposits() {
  const router = useRouter();
  const list = usePending();
  const sending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string[]>([]);
  const [dropping, setDropping] = useState<string | null>(null);

  const send = useCallback(async () => {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    const numbers: string[] = [];
    try {
      for (const deposit of toRetry(readPending())) {
        try {
          const outcome = await receiveOrder({ data: { key: deposit.key, order: deposit.order } as never });
          if (outcome.ok) {
            savePending(withoutPending(readPending(), deposit.key));
            numbers.push(outcome.output.number);
          } else {
            // Nettio answered, and says no: it waits for a person, with the reason.
            savePending(withError(readPending(), deposit.key, outcome.code));
          }
        } catch (error) {
          // Still no network: the rest waits too.
          if (isNetworkFailure(error, navigator.onLine)) break;
          savePending(withError(readPending(), deposit.key, 'not_possible'));
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
    if (numbers.length > 0) {
      setSent(numbers);
      await router.invalidate();
    }
  }, [router]);

  const waiting = toRetry(list).length;
  useEffect(() => {
    if (waiting === 0) return;
    const again = () => void send();
    window.addEventListener('online', again);
    const timer = setInterval(again, 30_000);
    if (navigator.onLine) again();
    return () => {
      window.removeEventListener('online', again);
      clearInterval(timer);
    };
  }, [waiting, send]);

  if (list.length === 0 && sent.length === 0) return null;
  const dropped = list.find((deposit) => deposit.key === dropping);
  return (
    <section
      aria-label={m.pending_title()}
      className="mb-4 rounded-box border border-state-verify bg-state-verify-surface p-4 text-state-verify-fg print:hidden"
    >
      <div aria-live="polite">
        {sent.length > 0 && <p className="font-semibold">{m.pending_sent({ numbers: sent.join(', ') })}</p>}
        {list.length > 0 && <p className="font-semibold">{m.pending_count({ count: list.length })}</p>}
      </div>
      {list.length > 0 && (
        <>
          <ul className="mt-2 flex flex-col gap-2 text-body-sm">
            {list.map((deposit) => (
              <li key={deposit.key} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                <span className="min-w-0">
                  {deposit.customer} · {formatMoney(deposit.total)} · {formatDayTime(deposit.savedAt)}
                  {deposit.error && <span className="block">{errorSentence(deposit.error)}</span>}
                </span>
                {deposit.error && (
                  <Button variant="secondary" disabled={busy} onClick={() => setDropping(deposit.key)}>
                    {m.pending_drop()}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          {waiting > 0 && (
            <div className="mt-3">
              <Button variant="secondary" disabled={busy} onClick={() => void send()}>
                {m.pending_send()}
              </Button>
            </div>
          )}
        </>
      )}
      <ConfirmDialog
        open={dropped !== undefined}
        title={m.review_confirm_title()}
        confirmLabel={m.pending_drop()}
        cancelLabel={m.action_close()}
        onCancel={() => setDropping(null)}
        onConfirm={() => {
          if (dropped) savePending(withoutPending(readPending(), dropped.key));
          setDropping(null);
        }}
      >
        {dropped ? m.pending_drop_confirm({ customer: dropped.customer }) : ''}
      </ConfirmDialog>
    </section>
  );
}
