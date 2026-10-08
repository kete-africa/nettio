import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { readCatalog } from '@/features/catalog';
import { advanceWork, reportIncident, resolveIncidentCommand } from './commands';
import { currentStep } from './domain/work';
import { listIncidents, unitsOfOrder, waitingUnits, type QueuedUnit } from './infrastructure/units';
import { advanceInput, incidentInput, resolveInput } from './work.record';

export interface WorkshopQueue {
  /** The steps where something waits, in the workshop's order, each with its units. */
  steps: { stepId: string; name: string; units: QueuedUnit[] }[];
  waiting: number;
  late: number;
}

/**
 * What a screen, a copilot or an agent may do in the workshop. Reading the queue is level 1. A
 * step validated or an incident commits the deposit's state: an agent only prepares it (level 3).
 */
export const workshopCapabilities = [
  defineCapability({
    name: 'workshop_queue',
    description:
      'What waits in the workshop, for a site or all: the units step by step, the soonest promised first, with their deposit number, promised date, express and rework count; how many wait and how many are late.',
    permission: 'workshop:operate',
    autonomy: 1,
    input: z.object({ siteId: z.string().max(64).optional() }),
    async run(input, { db }): Promise<WorkshopQueue> {
      const units = await waitingUnits(db, input);
      // The workshop's own order of steps; a step that left the catalogue keeps its place last.
      const order = new Map((await readCatalog(db)).steps.map((step, index) => [step.stepId, index]));
      const steps = new Map<string, { stepId: string; name: string; units: QueuedUnit[] }>();
      for (const unit of units) {
        const step = currentStep(unit);
        if (!step) continue;
        const group = steps.get(step.stepId) ?? { stepId: step.stepId, name: step.name, units: [] };
        group.units.push(unit);
        steps.set(step.stepId, group);
      }
      return {
        steps: [...steps.values()].sort(
          (a, b) => (order.get(a.stepId) ?? 999) - (order.get(b.stepId) ?? 999),
        ),
        waiting: units.length,
        late: new Set(units.filter((unit) => unit.late).map((unit) => unit.orderId)).size,
      };
    },
  }),
  defineCapability({
    name: 'workshop_order',
    description:
      'The work of one deposit: each unit with its route, the step it waits at, its reworks — and its incidents.',
    permission: 'orders:read',
    autonomy: 1,
    input: z.object({ orderId: z.string().min(1).max(64) }),
    async run(input, { db }) {
      return {
        units: await unitsOfOrder(db, input.orderId),
        incidents: await listIncidents(db, { orderId: input.orderId, openOnly: false }),
      };
    },
  }),
  defineCapability({
    name: 'workshop_incidents',
    description: 'The incidents still open in the workshop: what, on which deposit, since when.',
    permission: 'workshop:operate',
    autonomy: 1,
    input: z.object({}),
    run: (_input, { db }) => listIncidents(db, { openOnly: true }),
  }),
  defineCapability({
    name: 'workshop_advance',
    description:
      'Validates the step a unit waits at. The deposit becomes ready when all its units finished their route.',
    permission: 'workshop:operate',
    autonomy: 3,
    input: advanceInput,
    command: advanceWork,
    draft: { recordType: 'work_step' },
  }),
  defineCapability({
    name: 'workshop_report_incident',
    description:
      'Notes an incident on a unit (stain_left, damage, missing_piece, found_object, other) and may send it back to an earlier step of its route — a rework.',
    permission: 'workshop:operate',
    autonomy: 3,
    input: incidentInput,
    command: reportIncident,
    draft: { recordType: 'incident' },
  }),
  defineCapability({
    name: 'workshop_resolve_incident',
    description: 'Closes an incident with what was done about it.',
    permission: 'workshop:operate',
    autonomy: 3,
    input: resolveInput,
    command: resolveIncidentCommand,
    draft: { recordType: 'incident_resolution' },
  }),
];
