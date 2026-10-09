import { Button, Chip, EmptyState, PageHeader, PageSection, Row, RowList, Tag, TextField } from '@kete/design';
import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { MonthRun } from '@/features/accounts/ui/MonthRun';
import { statusOf, type InvoiceStatus } from '@/features/invoices/domain/invoice';
import { fetchInvoiceSettings, fetchInvoices, saveInvoiceSettings } from '@/features/invoices/functions';
import { invoiceStatusTones, invoiceStatusWords } from '@/features/invoices/ui/words';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote, Note, TextAreaField } from '@/lib/fields';
import { formatDay, formatMoney } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The invoices and credit notes (specs/019-invoices), and what the laundry prints on them.
export const Route = createFileRoute('/_app/factures')({
  loader: async () => ({ invoices: await fetchInvoices({ data: {} }), settings: await fetchInvoiceSettings() }),
  component: InvoicesPage,
});

type Filter = 'all' | InvoiceStatus | 'credit';

function InvoicesPage() {
  const { me } = Route.useRouteContext();
  const { invoices, settings } = Route.useLoaderData();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  if (!invoices) return <EmptyState title={m.error_not_allowed()} />;
  const rows = invoices
    .map((invoice) => ({ invoice, status: statusOf(invoice) }))
    .filter(({ invoice, status }) =>
      filter === 'all'
        ? true
        : filter === 'credit'
          ? invoice.kind === 'credit'
          : invoice.kind === 'invoice' && status === filter,
    );
  const due = invoices
    .filter((invoice) => invoice.kind === 'invoice' && !invoice.credited)
    .reduce((sum, invoice) => sum + (invoice.total - invoice.paid), 0);
  const filters: [Filter, string][] = [
    ['all', m.invoices_all()],
    ['due', invoiceStatusWords.due()],
    ['paid', invoiceStatusWords.paid()],
    ['credit', m.invoices_credits()],
  ];

  return (
    <>
      <PageHeader title={m.nav_invoices()} description={m.invoices_description()} />
      <p className="mb-5">
        <span className="text-fg-muted">{m.invoices_due()}</span>{' '}
        <span className="font-number text-[28px] leading-tight font-semibold">{formatMoney(due)}</span>
      </p>
      <div role="group" aria-label={m.invoices_filter()} className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1">
        {filters.map(([value, label]) => (
          <Chip key={value} className="shrink-0" pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </Chip>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyState title={m.invoices_none_title()}>{m.invoices_none_body()}</EmptyState>
      ) : (
        <RowList label={m.nav_invoices()}>
          {rows.map(({ invoice, status }) => (
            <Row
              key={invoice.invoiceId}
              onClick={() =>
                void navigate({ to: '/factures/$invoiceId', params: { invoiceId: invoice.invoiceId } })
              }
              title={`${invoice.number} · ${invoice.customerName}`}
              meta={formatDay(invoice.issuedOn)}
              end={
                <>
                  <span className="text-right font-number">
                    <span className="block">{formatMoney(invoice.total)}</span>
                    {invoice.kind === 'invoice' && status === 'due' && (
                      <span className="block text-body-sm text-fg-muted">
                        {m.order_balance_of({ amount: formatMoney(invoice.total - invoice.paid) })}
                      </span>
                    )}
                  </span>
                  {invoice.kind === 'credit' ? (
                    <Tag tone="neutral">{m.invoice_kind_credit()}</Tag>
                  ) : (
                    <Tag tone={invoiceStatusTones[status]}>{invoiceStatusWords[status]()}</Tag>
                  )}
                </>
              }
            />
          ))}
        </RowList>
      )}
      <MonthRun mayIssue={can(me, 'invoices:issue')} />
      {settings && <Mentions settings={settings} editable={can(me, 'settings:manage')} />}
    </>
  );
}

function Mentions({
  settings,
  editable,
}: {
  settings: NonNullable<Awaited<ReturnType<typeof fetchInvoiceSettings>>>;
  editable: boolean;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(settings);
  const [vat, setVat] = useState(settings.vatPercent > 0);
  const [percent, setPercent] = useState(settings.vatPercent > 0 ? String(settings.vatPercent) : '18');
  const [days, setDays] = useState(String(settings.paymentDays));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const field = (key: 'legalName' | 'taxId' | 'tradeRegister', label: string, max: number) => (
    <TextField
      label={label}
      value={draft[key]}
      maxLength={max}
      disabled={!editable}
      onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
    />
  );

  async function save() {
    const vatPercent = vat ? Number(percent.replace(',', '.')) : 0;
    const paymentDays = Number(days);
    if (!Number.isFinite(vatPercent) || vatPercent < 0 || vatPercent > 50 || !Number.isInteger(paymentDays)) {
      setError(m.error_invalid_input());
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const outcome = await saveInvoiceSettings({ data: { ...draft, vatPercent, paymentDays } });
      if (outcome.ok) {
        await router.invalidate();
        setSaved(true);
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
    <PageSection title={m.invoices_mentions()}>
      <p className="mb-4 max-w-3xl text-body-sm text-fg-muted">{m.invoices_mentions_hint()}</p>
      <div className="flex max-w-xl flex-col gap-4">
        {field('legalName', m.invoices_legal_name(), 160)}
        {field('taxId', m.invoices_tax_id(), 40)}
        {field('tradeRegister', m.invoices_trade_register(), 60)}
        <TextAreaField
          label={m.invoices_address()}
          value={draft.address}
          rows={2}
          maxLength={300}
          disabled={!editable}
          onChange={(address) => setDraft({ ...draft, address })}
        />
        <TextAreaField
          label={m.invoices_footer()}
          hint={m.invoices_footer_hint()}
          value={draft.footer}
          rows={2}
          maxLength={500}
          disabled={!editable}
          onChange={(footer) => setDraft({ ...draft, footer })}
        />
        <TextField
          label={m.invoices_payment_days()}
          type="number"
          inputMode="numeric"
          min={0}
          max={120}
          disabled={!editable}
          value={days}
          onChange={(event) => setDays(event.target.value)}
        />
        <CheckField
          label={m.invoices_vat()}
          hint={m.invoices_vat_hint()}
          checked={vat}
          disabled={!editable}
          onChange={setVat}
        />
        {vat && (
          <TextField
            className="max-w-40"
            label={m.invoices_vat_percent()}
            inputMode="decimal"
            disabled={!editable}
            value={percent}
            onChange={(event) => setPercent(event.target.value)}
          />
        )}
        <div className="flex flex-col gap-3" aria-live="polite">
          {saved && <Note>{m.invoices_mentions_saved()}</Note>}
          <ErrorNote>{error}</ErrorNote>
        </div>
        {editable && (
          <div>
            <Button disabled={busy} onClick={() => void save()}>
              {m.invoices_mentions_save()}
            </Button>
          </div>
        )}
      </div>
    </PageSection>
  );
}
