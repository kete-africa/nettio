import {
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  KpiGrid,
  KpiTile,
  PageHeader,
  PageSection,
  Row,
  RowList,
  Tag,
  TextField,
} from '@kete/design';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { z } from 'zod';
import { receives } from '@/features/business/domain/sites';
import { fetchBusiness } from '@/features/business/functions';
import type { Expense, PaidFrom } from '@/features/money';
import {
  expenseCategories,
  usualBehavior,
  type Behavior,
  type ExpenseCategory,
} from '@/features/money/domain/charges';
import {
  addDraw,
  addExpense,
  cancelExpense,
  fetchExpenses,
  stopExpense,
} from '@/features/money/functions';
import { paidFroms } from '@/features/money/money.record';
import { MonthNav } from '@/features/money/ui/MonthNav';
import { categoryWords, paidFromWords } from '@/features/money/ui/words';
import { fetchTeamNames } from '@/features/team/functions';
import { gestureKey } from '@/features/orders/ui/MoneyFields';
import { errorSentence } from '@/lib/errors';
import { CheckField, ChoiceField, ErrorNote, SelectField } from '@/lib/fields';
import { currentDay, currentMonth, formatDay, formatMoney, formatNumber } from '@/lib/format';
import type { Outcome } from '@/lib/rule-error';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

const search = z.object({
  mois: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

// Everything that goes out (specs/003-money-day, US2-3): fixed or variable, one-off or every
// month — and, apart, what the owner takes.
export const Route = createFileRoute('/_app/argent/depenses')({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search: { mois } }) => ({ mois }),
  loader: async ({ deps }) => ({
    view: await fetchExpenses({ data: deps.mois ? { month: deps.mois } : {} }),
    business: await fetchBusiness(),
    team: await fetchTeamNames(),
  }),
  component: ExpensesPage,
});

interface Draft {
  kind: 'expense' | 'draw';
  day: string;
  label: string;
  category: ExpenseCategory;
  behavior: Behavior;
  amount: string;
  paidFrom: PaidFrom;
  siteId: string;
  recurring: boolean;
  paidTo: string;
}

function ExpensesPage() {
  const { me } = Route.useRouteContext();
  const { view, business, team } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [chosen, setChosen] = useState<(Expense & { times: number }) | null>(null);
  const [reason, setReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [key, setKey] = useState(() => gestureKey('exp'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!view) return <EmptyState title={m.error_not_allowed()} />;
  const sites = (business?.sites ?? []).filter((site) => site.active && receives(site.kind));
  const writable = can(me, 'expenses:write');
  const month = view.month;
  const drawn = (view.draws ?? []).reduce((sum, draw) => sum + draw.amount, 0);

  const start = (kind: Draft['kind']) => {
    setError(null);
    setDraft({
      kind,
      day: month === currentMonth() ? currentDay() : `${month}-01`,
      label: '',
      category: 'detergent',
      behavior: usualBehavior.detergent,
      amount: '',
      paidFrom: kind === 'draw' ? 'mobile_money' : 'till',
      siteId: sites[0]?.siteId ?? '',
      recurring: false,
      paidTo: '',
    });
  };

  async function run(work: () => Promise<Outcome<unknown>>) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        setDraft(null);
        setChosen(null);
        setConfirming(false);
        setReason('');
        setKey(gestureKey('exp'));
        await router.invalidate();
      } else {
        setConfirming(false);
        setError(
          outcome.code === 'cash_not_in_till'
            ? m.error_cash_not_in_till({ amount: formatMoney(Number(outcome.facts['amount'] ?? 0)) })
            : errorSentence(outcome.code),
        );
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const submit = () => {
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!Number.isInteger(amount) || amount <= 0) return setError(m.error_amount());
    const siteId = draft.paidFrom === 'till' ? draft.siteId || null : null;
    if (draft.kind === 'draw') {
      return void run(() =>
        addDraw({
          data: {
            key,
            draw: { drawnOn: draft.day, amount, paidFrom: draft.paidFrom, siteId, note: draft.label },
          },
        }),
      );
    }
    return void run(() =>
      addExpense({
        data: {
          key,
          expense: {
            spentOn: draft.day,
            label: draft.label,
            category: draft.category,
            behavior: draft.behavior,
            amount,
            paidFrom: draft.paidFrom,
            siteId,
            recurring: draft.recurring,
            paidTo: draft.category === 'wages' && !draft.recurring && draft.paidTo ? draft.paidTo : null,
          },
        },
      }),
    );
  };

  return (
    <>
      <PageHeader
        title={m.nav_expenses()}
        description={m.expenses_description()}
        actions={
          <>
            <MonthNav
              month={month}
              onChange={(next) => void navigate({ to: '/argent/depenses', search: { mois: next } })}
            />
            {writable && <Button onClick={() => start('expense')}>{m.expenses_add()}</Button>}
          </>
        }
      />
      <KpiGrid label={m.nav_expenses()}>
        <KpiTile
          label={m.expenses_fixed()}
          value={formatNumber(view.totals.fixed)}
          hint={m.expenses_fixed_hint()}
        />
        <KpiTile
          label={m.expenses_variable()}
          value={formatNumber(view.totals.variable)}
          hint={m.expenses_variable_hint()}
        />
        <KpiTile label={m.expenses_total()} value={formatNumber(view.totals.total)} hint="F CFA" />
        {view.draws && (
          <KpiTile label={m.draws_title()} value={formatNumber(drawn)} hint={m.draws_hint()} />
        )}
      </KpiGrid>

      <PageSection title={m.expenses_list()}>
        {view.expenses.length === 0 ? (
          <EmptyState title={m.expenses_empty_title()}>{m.expenses_empty_body()}</EmptyState>
        ) : (
          <RowList label={m.expenses_list()}>
            {view.expenses.map((expense) => (
              <Row
                key={expense.expenseId}
                {...(writable && !expense.voided
                  ? {
                      onClick: () => {
                        setError(null);
                        setReason('');
                        setChosen(expense);
                      },
                    }
                  : {})}
                title={expense.label}
                meta={
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{categoryWords[expense.category]()}</span>
                    <Tag tone={expense.behavior === 'fixed' ? 'info' : 'neutral'}>
                      {expense.behavior === 'fixed' ? m.behavior_fixed() : m.behavior_variable()}
                    </Tag>
                    {expense.recurring && (
                      <Tag tone="agent">
                        {expense.stoppedOn
                          ? m.expenses_recurring_until({ date: formatDay(expense.stoppedOn) })
                          : m.expenses_recurring()}
                      </Tag>
                    )}
                    {expense.voided && <Tag tone="error">{m.expenses_voided()}</Tag>}
                    {!expense.recurring && <span>{formatDay(expense.spentOn)}</span>}
                  </span>
                }
                end={
                  <span className={`font-number ${expense.voided ? 'line-through opacity-60' : ''}`}>
                    {formatMoney(expense.amount)}
                  </span>
                }
              />
            ))}
          </RowList>
        )}
      </PageSection>

      {view.draws && (
        <PageSection title={m.draws_title()}>
          <p className="mb-3 max-w-3xl text-fg-muted">{m.draws_description()}</p>
          {view.draws.length > 0 && (
            <RowList label={m.draws_title()}>
              {view.draws.map((draw) => (
                <Row
                  key={draw.drawId}
                  title={formatDay(draw.drawnOn)}
                  meta={`${paidFromWords[draw.paidFrom]()}${draw.note ? ` · ${draw.note}` : ''}`}
                  end={<span className="font-number">{formatMoney(draw.amount)}</span>}
                />
              ))}
            </RowList>
          )}
          {can(me, 'draws:record') && (
            <div className="mt-3">
              <Button variant="secondary" onClick={() => start('draw')}>
                {m.draws_add()}
              </Button>
            </div>
          )}
        </PageSection>
      )}

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.kind === 'draw' ? m.draws_add() : m.expenses_add()}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button
              disabled={busy || (draft?.kind === 'expense' && !draft.label.trim())}
              onClick={submit}
            >
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <TextField
              label={m.expenses_day()}
              type="date"
              value={draft.day}
              onChange={(event) => setDraft({ ...draft, day: event.target.value })}
            />
            <TextField
              label={draft.kind === 'draw' ? m.counter_note() : m.expenses_label()}
              value={draft.label}
              maxLength={160}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
            {draft.kind === 'expense' && (
              <>
                <SelectField
                  label={m.expenses_category()}
                  value={draft.category}
                  onChange={(event) => {
                    const category = event.target.value as ExpenseCategory;
                    setDraft({ ...draft, category, behavior: usualBehavior[category] });
                  }}
                  options={expenseCategories.map((value) => ({
                    value,
                    label: categoryWords[value](),
                  }))}
                />
                {draft.category === 'wages' && !draft.recurring && team.length > 0 && (
                  <SelectField
                    label={m.expenses_paid_to()}
                    hint={m.expenses_paid_to_hint()}
                    value={draft.paidTo}
                    onChange={(event) => setDraft({ ...draft, paidTo: event.target.value })}
                    options={[
                      { value: '', label: m.expenses_paid_to_nobody() },
                      ...team.map((member) => ({ value: member.userId, label: member.name })),
                    ]}
                  />
                )}
                <ChoiceField
                  label={m.expenses_behavior()}
                  value={draft.behavior}
                  onChange={(behavior) => setDraft({ ...draft, behavior })}
                  options={[
                    { value: 'fixed', label: m.behavior_fixed(), hint: m.behavior_fixed_hint() },
                    {
                      value: 'variable',
                      label: m.behavior_variable(),
                      hint: m.behavior_variable_hint(),
                    },
                  ]}
                />
              </>
            )}
            <TextField
              label={m.money_amount()}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={draft.amount}
              onChange={(event) => setDraft({ ...draft, amount: event.target.value })}
            />
            <SelectField
              label={m.expenses_paid_from()}
              value={draft.paidFrom}
              onChange={(event) => {
                const paidFrom = event.target.value as PaidFrom;
                setDraft({
                  ...draft,
                  paidFrom,
                  recurring: paidFrom === 'till' ? false : draft.recurring,
                });
              }}
              options={paidFroms.map((value) => ({ value, label: paidFromWords[value]() }))}
            />
            {draft.paidFrom === 'till' && sites.length > 1 && (
              <SelectField
                label={m.counter_site()}
                value={draft.siteId}
                onChange={(event) => setDraft({ ...draft, siteId: event.target.value })}
                options={sites.map((site) => ({ value: site.siteId, label: site.name }))}
              />
            )}
            {draft.kind === 'expense' && draft.paidFrom !== 'till' && (
              <CheckField
                label={m.expenses_recurring_label()}
                hint={m.expenses_recurring_hint()}
                checked={draft.recurring}
                onChange={(recurring) => setDraft({ ...draft, recurring })}
              />
            )}
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>

      <Drawer
        open={chosen !== null}
        onClose={() => setChosen(null)}
        title={chosen?.label ?? ''}
        closeLabel={m.action_close()}
        footer={
          <>
            {chosen?.recurring && !chosen.stoppedOn && (
              <Button
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  chosen &&
                  void run(() =>
                    stopExpense({
                      data: {
                        expenseId: chosen.expenseId,
                        stoppedOn: month === currentMonth() ? currentDay() : `${month}-28`,
                      },
                    }),
                  )
                }
              >
                {m.expenses_stop()}
              </Button>
            )}
            <Button disabled={busy || !reason.trim()} onClick={() => setConfirming(true)}>
              {m.expenses_void()}
            </Button>
          </>
        }
      >
        {chosen && (
          <div className="flex flex-col gap-4">
            <p className="font-number text-title">{formatMoney(chosen.amount)}</p>
            {chosen.recurring && <p className="text-fg-muted">{m.expenses_stop_hint()}</p>}
            <TextField
              label={m.expenses_void_reason()}
              hint={m.expenses_void_hint()}
              value={reason}
              maxLength={300}
              onChange={(event) => setReason(event.target.value)}
            />
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirming}
        title={m.review_confirm_title()}
        confirmLabel={m.expenses_void()}
        cancelLabel={m.action_close()}
        onConfirm={() =>
          chosen && void run(() => cancelExpense({ data: { expenseId: chosen.expenseId, reason } }))
        }
        onCancel={() => setConfirming(false)}
      >
        {m.expenses_void_confirm({ label: chosen?.label ?? '' })}
      </ConfirmDialog>
    </>
  );
}
