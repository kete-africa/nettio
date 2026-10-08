import {
  Button,
  Chip,
  ChipGroup,
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
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { gestureKey } from '@/features/orders/ui/MoneyFields';
import type { Incident, QueuedUnit } from '@/features/workshop';
import { incidentKinds, type IncidentKind } from '@/features/workshop/domain/work';
import {
  advanceUnit,
  fetchQueue,
  reportUnitIncident,
  resolveUnitIncident,
} from '@/features/workshop/functions';
import { incidentWords } from '@/features/workshop/ui/words';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note, SelectField } from '@/lib/fields';
import { formatDayTime, formatNumber } from '@/lib/format';
import type { Outcome } from '@/lib/rule-error';
import * as m from '@/paraglide/messages.js';

// The workshop (specs/005-workshop): a queue per step, the soonest promised first, and one touch
// to validate a step. « Je sais quoi faire maintenant. »
export const Route = createFileRoute('/_app/atelier')({
  loader: () => fetchQueue(),
  component: WorkshopPage,
});

function WorkshopPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [stepId, setStepId] = useState<string | null>(null);
  const [reporting, setReporting] = useState<QueuedUnit | null>(null);
  const [kind, setKind] = useState<IncidentKind>('stain_left');
  const [note, setNote] = useState('');
  const [backTo, setBackTo] = useState('');
  const [resolving, setResolving] = useState<Incident | null>(null);
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!data) return <EmptyState title={m.error_not_allowed()} />;
  const { queue, incidents } = data;
  const step = queue.steps.find((entry) => entry.stepId === stepId) ?? queue.steps[0];

  async function run<T>(id: string, work: () => Promise<Outcome<T>>, after: (output: T) => void) {
    setBusy(id);
    setError(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        // What is said follows what is shown: the queue first, then the sentence.
        await router.invalidate();
        after(outcome.output);
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(null);
    }
  }

  const validate = (unit: QueuedUnit) =>
    void run(
      unit.unitId,
      () => advanceUnit({ data: { key: gestureKey('wrk'), step: { unitId: unit.unitId } } }),
      (output) =>
        setSaid(
          output.orderReady
            ? m.workshop_said_ready({ number: output.number })
            : output.next
              ? m.workshop_said_next({ number: output.number, done: output.done, next: output.next })
              : m.workshop_said_done({ number: output.number, done: output.done }),
        ),
    );

  return (
    <>
      <PageHeader title={m.nav_workshop()} description={m.workshop_description()} />
      <KpiGrid label={m.nav_workshop()}>
        <KpiTile label={m.workshop_waiting()} value={formatNumber(queue.waiting)} hint={m.workshop_waiting_hint()} />
        <KpiTile label={m.workshop_late()} value={formatNumber(queue.late)} hint={m.workshop_late_hint()} />
        <KpiTile label={m.workshop_incidents()} value={formatNumber(incidents.length)} hint={m.workshop_incidents_hint()} />
      </KpiGrid>
      <div className="mt-4 flex flex-col gap-3" aria-live="polite">
        {said && <Note>{said}</Note>}
        {!reporting && !resolving && <ErrorNote>{error}</ErrorNote>}
      </div>

      <PageSection title={m.workshop_queue()}>
        {queue.steps.length === 0 || !step ? (
          <EmptyState title={m.workshop_empty_title()}>{m.workshop_empty_body()}</EmptyState>
        ) : (
          <>
            <ChipGroup label={m.workshop_step()}>
              {queue.steps.map((entry) => (
                <Chip
                  key={entry.stepId}
                  pressed={entry.stepId === step.stepId}
                  onClick={() => setStepId(entry.stepId)}
                >
                  {entry.name} · {entry.units.length}
                </Chip>
              ))}
            </ChipGroup>
            <ul className="mt-4 flex flex-col gap-3">
              {step.units.map((unit) => (
                <li
                  key={unit.unitId}
                  className="flex flex-col gap-3 rounded-box border border-line bg-surface p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        to="/depots/$orderId"
                        params={{ orderId: unit.orderId }}
                        className="font-number text-title font-semibold underline"
                      >
                        {unit.number}
                      </Link>
                      <p>{unit.label}</p>
                      <p className="text-body-sm text-fg-muted">
                        {m.workshop_unit_meta({
                          quantity: formatNumber(unit.quantity, 3),
                          date: formatDayTime(unit.promisedAt),
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {unit.late && <Tag tone="error">{m.workshop_tag_late()}</Tag>}
                      {unit.express && <Tag tone="verify">{m.counter_express()}</Tag>}
                      {unit.rework > 0 && (
                        <Tag tone="verify">{m.workshop_tag_rework({ count: unit.rework })}</Tag>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setError(null);
                        setNote('');
                        setBackTo('');
                        setReporting(unit);
                      }}
                    >
                      {m.workshop_report()}
                    </Button>
                    <Button
                      className="min-h-12 min-w-40"
                      disabled={busy !== null}
                      onClick={() => validate(unit)}
                    >
                      {m.workshop_validate({ step: step.name })}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </PageSection>

      {incidents.length > 0 && (
        <PageSection title={m.workshop_open_incidents()}>
          <RowList label={m.workshop_open_incidents()}>
            {incidents.map((incident) => (
              <Row
                key={incident.incidentId}
                onClick={() => {
                  setError(null);
                  setResolution('');
                  setResolving(incident);
                }}
                title={`${incident.number} · ${incidentWords[incident.kind]()}`}
                meta={`${incident.label}${incident.note ? ` · ${incident.note}` : ''}`}
                end={<span className="text-body-sm text-fg-muted">{formatDayTime(incident.createdAt)}</span>}
              />
            ))}
          </RowList>
        </PageSection>
      )}

      <Drawer
        open={reporting !== null}
        onClose={() => setReporting(null)}
        title={m.workshop_report()}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setReporting(null)}>
              {m.action_cancel()}
            </Button>
            <Button
              disabled={busy !== null}
              onClick={() =>
                reporting &&
                void run(
                  'incident',
                  () =>
                    reportUnitIncident({
                      data: { unitId: reporting.unitId, kind, note, backToStepId: backTo || null },
                    }),
                  () => {
                    setReporting(null);
                    setSaid(null);
                  },
                )
              }
            >
              {m.workshop_report()}
            </Button>
          </>
        }
      >
        {reporting && (
          <div className="flex flex-col gap-4">
            <p className="text-fg-muted">
              {reporting.number} · {reporting.label}
            </p>
            <SelectField
              label={m.workshop_incident_kind()}
              value={kind}
              onChange={(event) => setKind(event.target.value as IncidentKind)}
              options={incidentKinds.map((value) => ({ value, label: incidentWords[value]() }))}
            />
            <TextField
              label={m.counter_note()}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
            {reporting.position > 0 && (
              <SelectField
                label={m.workshop_back_to()}
                hint={m.workshop_back_to_hint()}
                value={backTo}
                onChange={(event) => setBackTo(event.target.value)}
                options={[
                  { value: '', label: m.workshop_no_rework() },
                  ...reporting.route
                    .slice(0, reporting.position)
                    .map((entry) => ({ value: entry.stepId, label: entry.name })),
                ]}
              />
            )}
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>

      <Drawer
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title={m.workshop_resolve()}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setResolving(null)}>
              {m.action_cancel()}
            </Button>
            <Button
              disabled={busy !== null || !resolution.trim()}
              onClick={() =>
                resolving &&
                void run(
                  'resolve',
                  () => resolveUnitIncident({ data: { incidentId: resolving.incidentId, resolution } }),
                  () => setResolving(null),
                )
              }
            >
              {m.workshop_resolve()}
            </Button>
          </>
        }
      >
        {resolving && (
          <div className="flex flex-col gap-4">
            <p>
              {resolving.number} · {incidentWords[resolving.kind]()}
              {resolving.note && <span className="block text-fg-muted">{resolving.note}</span>}
            </p>
            <TextField
              label={m.workshop_resolution()}
              value={resolution}
              maxLength={500}
              onChange={(event) => setResolution(event.target.value)}
            />
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>
    </>
  );
}
