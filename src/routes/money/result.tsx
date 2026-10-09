import {
  EmptyState,
  KpiGrid,
  KpiTile,
  PageHeader,
  PageSection,
  Tag,
} from '@kete/design';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { z } from 'zod';
import { ExplainButton } from '@/features/assistant/ui/Assistant';
import { fetchResult } from '@/features/money/functions';
import { MonthNav } from '@/features/money/ui/MonthNav';
import { confidenceTones, confidenceWords } from '@/features/money/ui/words';
import { Note } from '@/lib/fields';
import {
  currentMonth,
  formatMoney,
  formatMonth,
  formatNumber,
  formatPercent,
  formatSigned,
} from '@/lib/format';
import * as m from '@/paraglide/messages.js';

const search = z.object({
  mois: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

// « Est-ce que je gagne, et sur quoi ? » (specs/004-earn). Every figure is computed by code, shown
// with its unit and its period; what is not measured is said, never estimated; a pack sold at a
// loss is shown as it is — Nettio advises no price.
export const Route = createFileRoute('/_app/argent/resultat')({
  validateSearch: (input) => search.parse(input),
  loaderDeps: ({ search: { mois } }) => ({ mois }),
  loader: ({ deps }) => fetchResult({ data: deps.mois ? { month: deps.mois } : {} }),
  component: ResultPage,
});

function ResultPage() {
  const view = Route.useLoaderData();
  const navigate = useNavigate();
  if (!view) return <EmptyState title={m.error_not_allowed()} />;
  const { result, breakEven: even, reconciliation: planned } = view;
  const coverage = formatPercent(Math.round(even.coverage * 100));
  return (
    <>
      <PageHeader
        title={m.result_title({ month: formatMonth(view.month) })}
        description={m.result_description()}
        actions={
          <MonthNav
            month={view.month}
            onChange={(next) => void navigate({ to: '/argent/resultat', search: { mois: next } })}
          />
        }
      />
      <KpiGrid label={m.nav_result()}>
        <KpiTile label={m.result_cashed()} value={formatNumber(result.cashed)} hint={m.result_cashed_hint()} />
        <KpiTile
          label={m.result_charges()}
          value={formatNumber(result.charges)}
          hint={m.result_charges_hint({ fixed: formatMoney(view.fixedCharges) })}
        />
        <KpiTile
          label={m.result_result()}
          value={formatNumber(result.result)}
          hint={
            result.cashed > 0
              ? m.result_rate({ rate: formatPercent(Math.round(result.rate)) })
              : m.result_no_cash()
          }
        />
        <KpiTile
          label={m.result_drawn()}
          value={formatNumber(result.draws)}
          hint={m.result_left({ left: formatMoney(result.left) })}
        />
      </KpiGrid>
      <ExplainButton question={m.explain_question_result({ month: view.month })}>
        {m.explain_figures()}
      </ExplainButton>

      {view.month === currentMonth() && (
        <div className="mt-4">
          <Note>{m.result_month_running()}</Note>
        </div>
      )}

      <PageSection title={m.result_break_even()}>
        <p className="max-w-3xl text-body">
          {even.reason === 'no_activity' && m.break_even_no_activity()}
          {even.reason === 'no_sheet' && m.break_even_no_sheet()}
          {even.reason === 'no_contribution' &&
            m.break_even_no_contribution({
              revenue: formatMoney(even.revenuePerUnit),
              cost: formatMoney(even.variablePerUnit),
            })}
          {even.reason === null &&
            m.break_even_sentence({
              month: formatNumber(Math.ceil(even.unitsPerMonth ?? 0)),
              day: formatNumber(Math.ceil(even.unitsPerDay ?? 0)),
              units: formatNumber(view.units, 1),
            })}
        </p>
        {even.reason === null && (
          <p className="mt-2 max-w-3xl text-body-sm text-fg-muted">
            {m.break_even_how({
              fixed: formatMoney(view.fixedCharges),
              contribution: formatMoney(even.contribution),
              revenue: formatMoney(even.revenuePerUnit),
              cost: formatMoney(even.variablePerUnit),
              days: view.workingDays,
              coverage,
            })}
          </p>
        )}
        {even.reason === 'no_sheet' && (
          <p className="mt-3">
            <Link to="/argent/couts" className="text-link underline">
              {m.costs_go()}
            </Link>
          </p>
        )}
      </PageSection>

      <PageSection title={m.result_packs()}>
        <p className="mb-4 max-w-3xl text-fg-muted">{m.result_packs_description()}</p>
        {view.packs.length === 0 ? (
          <EmptyState title={m.result_no_pack_title()}>{m.result_no_pack_body()}</EmptyState>
        ) : (
          // Rows, not a wide table: the margin is read on a phone without scrolling sideways.
          <ul className="divide-y divide-line rounded-box border border-line bg-surface">
            {view.packs.map((pack) => (
              <li key={pack.packName} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold">{pack.packName}</p>
                  <p className="text-body-sm text-fg-muted">
                    {m.result_pack_line({
                      sold: formatNumber(pack.sold),
                      price: formatMoney(pack.price),
                      cost: pack.cost === null ? '—' : formatMoney(pack.cost),
                    })}
                  </p>
                  {pack.confidence === 'partial' && (
                    <p className="text-body-sm text-fg-muted">
                      {m.result_costed_sales({ costed: pack.costedSales, sold: pack.sold })}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span
                    className={`font-number text-title font-semibold ${
                      pack.margin !== null && pack.margin < 0 ? 'text-state-error-fg' : ''
                    }`}
                  >
                    {pack.margin === null ? '—' : formatSigned(pack.margin)}
                  </span>
                  <Tag tone={confidenceTones[pack.confidence]}>{confidenceWords[pack.confidence]()}</Tag>
                </div>
              </li>
            ))}
          </ul>
        )}
        {view.belowCost > 0 && (
          <div className="mt-4">
            <Note>{m.result_below_cost({ count: view.belowCost })}</Note>
          </div>
        )}
      </PageSection>

      <PageSection title={m.result_reconciliation()}>
        <p className="mb-4 max-w-3xl text-fg-muted">{m.result_reconciliation_description()}</p>
        <KpiGrid>
          <KpiTile
            label={m.result_planned()}
            value={formatNumber(planned.planned)}
            hint={m.result_planned_hint({ coverage: formatPercent(Math.round(planned.coverage * 100)) })}
          />
          <KpiTile label={m.result_real()} value={formatNumber(planned.real)} hint={m.result_real_hint()} />
          <KpiTile
            label={m.result_gap()}
            value={formatSigned(planned.gap).replace(/ F CFA$/, '')}
            hint={planned.gap > 0 ? m.result_gap_over() : m.result_gap_under()}
          />
        </KpiGrid>
      </PageSection>

      <PageSection title={m.result_how_title()}>
        <ul className="flex max-w-3xl list-disc flex-col gap-1.5 pl-5 text-fg-muted">
          <li>{m.result_how_cashed()}</li>
          <li>{m.result_how_charges()}</li>
          <li>{m.result_how_fixed()}</li>
          <li>{m.result_how_pack()}</li>
          <li>{m.result_how_never()}</li>
        </ul>
      </PageSection>
    </>
  );
}
