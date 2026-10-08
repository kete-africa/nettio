import { Tag } from '@kete/design';
import { cx } from '@/lib/fields';
import { formatDayTime } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { Incident, WorkUnit } from '../infrastructure/units';
import { incidentWords } from './words';

/** The work of a deposit: each unit along its route — what is done, where it waits — and its incidents. */
export function OrderWork({ units, incidents }: { units: WorkUnit[]; incidents: Incident[] }) {
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-3">
        {units.map((unit) => (
          <li key={unit.unitId} className="rounded-box border border-line bg-surface p-4">
            <p className="mb-2 flex flex-wrap items-center gap-2 font-semibold">
              {unit.label}
              {unit.rework > 0 && <Tag tone="verify">{m.workshop_tag_rework({ count: unit.rework })}</Tag>}
              {unit.finishedAt && <Tag tone="validated">{m.workshop_unit_done()}</Tag>}
            </p>
            <ol className="flex flex-wrap gap-1.5">
              {unit.route.map((step, index) => (
                <li
                  key={step.stepId}
                  aria-current={index === unit.position ? 'step' : undefined}
                  className={cx(
                    'rounded-control border px-2.5 py-1 text-body-sm',
                    index < unit.position && 'border-line bg-surface-selected text-fg-muted line-through',
                    index === unit.position && 'border-line-selected font-semibold',
                    index > unit.position && 'border-line text-fg-muted',
                  )}
                >
                  {step.name}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ul>
      {incidents.length > 0 && (
        <ul className="flex flex-col gap-2">
          {incidents.map((incident) => (
            <li key={incident.incidentId} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-number text-body-sm text-fg-muted">{formatDayTime(incident.createdAt)}</span>
              <span className="font-semibold">{incidentWords[incident.kind]()}</span>
              {incident.note && <span className="text-fg-muted">{incident.note}</span>}
              {incident.resolvedAt ? (
                <Tag tone="validated">{incident.resolution}</Tag>
              ) : (
                <Tag tone="verify">{m.workshop_incident_open()}</Tag>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
