import { Button, EmptyState, PageHeader, PageSection, TextField } from '@kete/design';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { fetchTeamWork, saveRate } from '@/features/team/functions';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note } from '@/lib/fields';
import { formatMoney, formatMonth, formatNumber, formatSigned, shiftMonth } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

const search = z.object({ mois: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });

// The work of each person in the workshop and what it earns at the laundry's piece rates
// (specs/015-team-pay): counted from the steps signed, never typed.
export const Route = createFileRoute('/_app/pressing/travail')({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search: { mois } }) => ({ mois }),
  loader: ({ deps }) => fetchTeamWork({ data: deps.mois ? { month: deps.mois } : {} }),
  component: WorkPage,
});

function WorkPage() {
  const { me } = Route.useRouteContext();
  const view = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!view) return <EmptyState title={m.error_not_allowed()} />;
  const editable = can(me, 'pay:manage');
  const go = (by: number) => void navigate({ to: '/pressing/travail', search: { mois: shiftMonth(view.month, by) } });

  async function save(stepId: string, name: string) {
    const raw = (typed[stepId] ?? '').trim();
    const amount = raw === '' ? null : Number(raw);
    if (amount !== null && (!Number.isInteger(amount) || amount < 0)) {
      setError(m.error_amount());
      return;
    }
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await saveRate({ data: { stepId, amount } });
      if (outcome.ok) {
        await router.invalidate();
        setTyped((current) => {
          const { [stepId]: _saved, ...rest } = current;
          return rest;
        });
        setSaid(
          amount === null
            ? m.work_rate_removed({ step: name })
            : m.work_rate_saved({ step: name, amount: formatMoney(amount) }),
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
    <>
      <PageHeader title={m.work_title()} description={m.work_description()} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => go(-1)}>
          {m.month_previous()}
        </Button>
        <span className="font-heading text-title font-semibold">{formatMonth(view.month)}</span>
        <Button variant="secondary" onClick={() => go(1)}>
          {m.month_next()}
        </Button>
      </div>
      <div className="mb-6 flex flex-col gap-3" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>

      <PageSection first title={m.work_people()}>
        {view.people.length === 0 ? (
          <p className="text-fg-muted">{m.work_nobody()}</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {view.people.map((person) => (
              <li key={person.userId} className="rounded-box border border-line bg-surface p-4">
                <h3 className="font-heading text-title font-semibold">{person.name}</h3>
                {person.lines.length > 0 && (
                  <ul className="mt-3 flex flex-col gap-1.5">
                    {person.lines.map((line) => (
                      <li key={line.stepId} className="flex flex-wrap items-baseline justify-between gap-x-4">
                        <span>
                          {line.stepName} —{' '}
                          <span className="font-number">{formatNumber(line.pieces, 1)}</span>
                          {line.redone > 0 && (
                            <span className="text-body-sm text-fg-muted">
                              {' '}
                              {m.work_redone({ count: formatNumber(line.redone, 1) })}
                            </span>
                          )}
                        </span>
                        <span className="font-number text-fg-muted">
                          {line.rate === null
                            ? m.work_no_rate()
                            : m.work_at_rate({ rate: formatMoney(line.rate), amount: formatMoney(line.amount) })}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-line pt-3 text-body-sm">
                  <div>
                    <dt className="text-fg-muted">{m.work_earned()}</dt>
                    <dd className="font-number font-semibold">{formatMoney(person.earned)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{m.work_paid()}</dt>
                    <dd className="font-number font-semibold">{formatMoney(person.paid)}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-muted">{m.work_left()}</dt>
                    <dd className="font-number font-semibold">{formatSigned(person.left)}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        )}
        {view.people.length > 0 && (
          <p className="mt-4 font-semibold">
            {m.work_totals({
              earned: formatMoney(view.totals.earned),
              paid: formatMoney(view.totals.paid),
              left: formatSigned(view.totals.left),
            })}
          </p>
        )}
        <p className="mt-3 max-w-3xl text-body-sm text-fg-muted">{m.work_how()}</p>
      </PageSection>

      <PageSection title={m.work_rates()}>
        <p className="mb-4 max-w-3xl text-body-sm text-fg-muted">{m.work_rates_hint()}</p>
        {view.rates.length === 0 ? (
          <p className="text-fg-muted">{m.work_no_step()}</p>
        ) : (
          <ul className="flex max-w-xl flex-col gap-4">
            {view.rates.map((rate) => (
              <li key={rate.stepId} className="flex flex-wrap items-end gap-3">
                <TextField
                  className="min-w-40 flex-1"
                  label={rate.name}
                  {...(rate.amount === null ? { hint: m.work_rate_none() } : {})}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  disabled={!editable || busy}
                  value={typed[rate.stepId] ?? (rate.amount === null ? '' : String(rate.amount))}
                  onChange={(event) =>
                    setTyped((current) => ({ ...current, [rate.stepId]: event.target.value }))
                  }
                />
                {editable && (
                  <Button
                    variant="secondary"
                    disabled={busy || typed[rate.stepId] === undefined}
                    onClick={() => void save(rate.stepId, rate.name)}
                  >
                    {m.work_rate_save({ step: rate.name })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </>
  );
}
