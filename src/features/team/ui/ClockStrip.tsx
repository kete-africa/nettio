import { Button } from '@kete/design';
import { useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { errorSentence } from '@/lib/errors';
import { ErrorNote } from '@/lib/fields';
import { formatDayTime } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import { hoursAndMinutes, type PersonPresence } from '../domain/presence';
import { clockIn, clockOut } from '../functions';

/**
 * The person's own clock, at the top of her day (specs/024-presence): she says she starts, she
 * says she is done. One line, one button.
 */
export function ClockStrip({ presence }: { presence: PersonPresence }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const outcome = presence.present ? await clockOut() : await clockIn({ data: {} });
      if (outcome.ok) await router.invalidate();
      else setError(errorSentence(outcome.code));
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-box border border-line bg-surface px-4 py-3">
        <p className="min-w-0">
          <span className="font-semibold">
            {presence.present && presence.since
              ? m.clock_in_since({ time: formatDayTime(presence.since) })
              : m.clock_out_now()}
          </span>
          {presence.dayMinutes > 0 && (
            <span className="block text-body-sm text-fg-muted">
              {m.clock_today({ duration: m.presence_duration(hoursAndMinutes(presence.dayMinutes)) })}
            </span>
          )}
        </p>
        <Button variant="secondary" disabled={busy} onClick={() => void toggle()}>
          {presence.present ? m.clock_out() : m.clock_in()}
        </Button>
      </div>
      {error && (
        <div className="mt-2">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}
    </div>
  );
}
