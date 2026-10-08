import { Button, DataTable, Drawer, EmptyState, PageHeader, Tag, TextField } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { fetchCosts, saveSheet, type CostsView } from '@/features/money/functions';
import { errorSentence } from '@/lib/errors';
import { ChoiceField, ErrorNote, Note } from '@/lib/fields';
import { formatDay, formatMoney, formatNumber, formatSigned } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The cost sheets (specs/004-earn, US2): what each article costs to treat for each service —
// measured at the laundry, or only estimated. A couple with no sheet is « never measured ».
export const Route = createFileRoute('/_app/argent/couts')({
  loader: () => fetchCosts({ data: {} }),
  component: CostsPage,
});

type Row = CostsView['rows'][number];

interface Draft {
  row: Row;
  laborMinutes: string;
  consumablesCost: string;
  machineCost: string;
  measured: 'measured' | 'estimated';
}

function CostsPage() {
  const { me } = Route.useRouteContext();
  const view = Route.useLoaderData();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!view) return <EmptyState title={m.error_not_allowed()} />;
  const editable = can(me, 'costs:manage');
  const nameOf = (row: Row) => (row.articleName ? `${row.articleName} · ${row.serviceName}` : row.serviceName);
  const missing = view.rows.filter((row) => !row.sheet).length;

  const open = (row: Row) => {
    setError(null);
    setDraft({
      row,
      laborMinutes: row.sheet ? String(row.sheet.laborMinutes) : '',
      consumablesCost: row.sheet ? String(row.sheet.consumablesCost) : '',
      machineCost: row.sheet ? String(row.sheet.machineCost) : '',
      measured: row.sheet?.measured ? 'measured' : 'estimated',
    });
  };

  async function submit() {
    if (!draft) return;
    const numbers = [draft.laborMinutes, draft.consumablesCost, draft.machineCost].map((text) =>
      text.trim() === '' ? 0 : Number(text),
    );
    if (numbers.some((value) => !Number.isFinite(value) || value < 0)) {
      setError(m.error_invalid_input());
      return;
    }
    setBusy(true);
    try {
      const outcome = await saveSheet({
        data: {
          serviceId: draft.row.serviceId,
          articleId: draft.row.articleId,
          laborMinutes: numbers[0] ?? 0,
          consumablesCost: numbers[1] ?? 0,
          machineCost: numbers[2] ?? 0,
          measured: draft.measured === 'measured',
        },
      });
      if (outcome.ok) {
        setDraft(null);
        await router.invalidate();
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
      <PageHeader title={m.nav_costs()} description={m.costs_description()} />
      {missing > 0 && (
        <div className="mb-4">
          <Note>{m.costs_missing({ count: missing })}</Note>
        </div>
      )}
      <DataTable
        caption={m.nav_costs()}
        rows={view.rows}
        rowKey={(row) => `${row.serviceId}|${row.articleId ?? ''}`}
        {...(editable ? { onRowClick: open } : {})}
        empty={<EmptyState title={m.counter_no_price_title()}>{m.costs_no_price()}</EmptyState>}
        columns={[
          { key: 'name', label: m.order_piece(), render: nameOf },
          { key: 'price', label: m.field_price(), align: 'end', render: (row) => formatMoney(row.price) },
          {
            key: 'variable',
            label: m.costs_variable(),
            align: 'end',
            render: (row) => (row.variableCost === null ? '—' : formatMoney(row.variableCost)),
          },
          {
            key: 'complete',
            label: m.costs_complete(),
            align: 'end',
            render: (row) => (row.completeCost === null ? '—' : formatMoney(row.completeCost)),
          },
          {
            key: 'margin',
            label: m.result_margin(),
            align: 'end',
            render: (row) =>
              row.completeCost === null ? (
                '—'
              ) : (
                <span className={row.price - row.completeCost < 0 ? 'font-semibold text-state-error-fg' : 'font-semibold'}>
                  {formatSigned(row.price - row.completeCost)}
                </span>
              ),
          },
          {
            key: 'measured',
            label: m.result_measured(),
            render: (row) =>
              !row.sheet ? (
                <Tag>{m.confidence_never()}</Tag>
              ) : row.sheet.measured ? (
                <Tag tone="validated">{m.confidence_measured()}</Tag>
              ) : (
                <Tag tone="verify">{m.confidence_estimated()}</Tag>
              ),
          },
        ]}
      />
      <p className="mt-4 max-w-3xl text-body-sm text-fg-muted">
        {view.spread.minutes > 0
          ? m.costs_how_minutes({
              fixed: formatMoney(view.fixedCharges),
              minutes: formatNumber(view.spread.minutes),
              rate: formatNumber(view.spread.perMinute, 1),
            })
          : m.costs_how_units({ fixed: formatMoney(view.fixedCharges) })}{' '}
        {view.laborIsVariable
          ? m.costs_labor_variable({ rate: formatNumber(view.laborMinuteCost, 2) })
          : m.costs_labor_fixed()}
      </p>

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft ? nameOf(draft.row) : ''}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button disabled={busy} onClick={() => void submit()}>
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <p className="text-fg-muted">
              {draft.row.articleId ? m.costs_for_piece() : m.costs_for_kilo()}
              {draft.row.sheet && (
                <span className="block text-body-sm">
                  {m.costs_last({ date: formatDay(draft.row.sheet.measuredOn) })}
                </span>
              )}
            </p>
            <TextField
              label={m.costs_minutes()}
              hint={m.costs_minutes_hint()}
              type="number"
              inputMode="decimal"
              min={0}
              step={0.5}
              value={draft.laborMinutes}
              onChange={(event) => setDraft({ ...draft, laborMinutes: event.target.value })}
            />
            <TextField
              label={m.costs_consumables()}
              hint={m.costs_consumables_hint()}
              type="number"
              inputMode="decimal"
              min={0}
              value={draft.consumablesCost}
              onChange={(event) => setDraft({ ...draft, consumablesCost: event.target.value })}
            />
            <TextField
              label={m.costs_machine()}
              hint={m.costs_machine_hint()}
              type="number"
              inputMode="decimal"
              min={0}
              value={draft.machineCost}
              onChange={(event) => setDraft({ ...draft, machineCost: event.target.value })}
            />
            <ChoiceField
              label={m.costs_origin()}
              value={draft.measured}
              onChange={(measured) => setDraft({ ...draft, measured })}
              options={[
                { value: 'measured', label: m.confidence_measured(), hint: m.costs_measured_hint() },
                { value: 'estimated', label: m.confidence_estimated(), hint: m.costs_estimated_hint() },
              ]}
            />
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>
    </>
  );
}
