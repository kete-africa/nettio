import { defineCommand } from '@kete/commands';
import { lockOrder, noteEvent, setStatus } from '@/features/orders';
import { personBehind, signer } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { announce } from '@/platform/announce';
import { advance, currentStep, sendBack } from './domain/work';
import {
  insertIncident,
  lockUnit,
  moveUnit,
  noteWork,
  resolveIncident,
  unfinishedUnits,
} from './infrastructure/units';
import { advanceInput, incidentInput, resolveInput } from './work.record';

/**
 * Validates the step a unit waits at: signed and dated. The deposit becomes « in progress » at
 * its first step, and « ready » when every one of its units finished its route — never before.
 */
export const advanceWork = defineCommand({
  name: 'advance-work',
  input: advanceInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const unit = await lockUnit(db, input.unitId);
    if (!unit) throw new RuleError('not_found');
    const order = await lockOrder(db, unit.orderId);
    if (!order) throw new RuleError('not_found');
    if (order.status !== 'received' && order.status !== 'in_progress') {
      throw new RuleError('order_not_open');
    }
    const step = advance(unit);
    await moveUnit(db, { unitId: unit.unitId, position: step.position, finished: step.finished });
    await noteWork(db, organizationId, {
      unitId: unit.unitId,
      orderId: order.orderId,
      kind: 'step',
      step: step.done,
      actor: signer(actor),
    });
    if (order.status === 'received') {
      await setStatus(db, order.orderId, 'in_progress');
      await noteEvent(db, organizationId, {
        orderId: order.orderId,
        kind: 'in_progress',
        detail: { step: step.done.name },
        actor: signer(actor),
      });
    }
    const orderReady = step.finished && (await unfinishedUnits(db, order.orderId)) === 0;
    if (orderReady) {
      await setStatus(db, order.orderId, 'ready');
      await noteEvent(db, organizationId, {
        orderId: order.orderId,
        kind: 'ready',
        actor: signer(actor),
      });
      await announce(db, {
        type: 'order.ready',
        organization: organizationId,
        data: { orderId: order.orderId, siteId: order.siteId },
      });
    }
    return {
      unitId: unit.unitId,
      orderId: order.orderId,
      number: order.number,
      done: step.done.name,
      next: currentStep({ route: unit.route, position: step.position })?.name ?? null,
      orderReady,
    };
  },
  summarize: (_input, output) => `${output.done} done for deposit ${output.number}`,
});

/**
 * Notes an incident on a unit — a stain that stays, a damage, a missing piece, an object found —
 * and, when it asks for it, sends the unit back to an earlier step: a rework, counted apart. A
 * deposit that was already ready goes back to « in progress ».
 */
export const reportIncident = defineCommand({
  name: 'report-incident',
  input: incidentInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const unit = await lockUnit(db, input.unitId);
    if (!unit) throw new RuleError('not_found');
    const order = await lockOrder(db, unit.orderId);
    if (!order) throw new RuleError('not_found');
    if (order.status === 'collected' || order.status === 'cancelled') {
      throw new RuleError('order_not_open');
    }
    const back = input.backToStepId ? sendBack(unit, input.backToStepId) : null;
    const incidentId = await insertIncident(db, organizationId, {
      unitId: unit.unitId,
      orderId: order.orderId,
      kind: input.kind,
      note: input.note,
      backToStep: back === null ? null : (unit.route[back]?.name ?? null),
      createdBy: personBehind(actor),
    });
    await noteEvent(db, organizationId, {
      orderId: order.orderId,
      kind: 'incident',
      detail: { incident: input.kind, ...(input.note ? { reason: input.note } : {}) },
      actor: signer(actor),
    });
    if (back !== null) {
      const step = unit.route[back];
      await moveUnit(db, { unitId: unit.unitId, position: back, finished: false, reworked: true });
      if (step) {
        await noteWork(db, organizationId, {
          unitId: unit.unitId,
          orderId: order.orderId,
          kind: 'rework',
          step,
          actor: signer(actor),
        });
      }
      // Work is left again: the deposit is no longer ready.
      if (order.status === 'ready') await setStatus(db, order.orderId, 'in_progress');
    }
    return { incidentId, orderId: order.orderId, number: order.number, rework: back !== null };
  },
  summarize: (input, output) => `Incident (${input.kind}) on deposit ${output.number}`,
});

/** Closes an incident with what was done about it. */
export const resolveIncidentCommand = defineCommand({
  name: 'resolve-incident',
  input: resolveInput,
  reversibility: { reversible: false },
  async handler(input, { db, actor }) {
    const resolved = await resolveIncident(db, {
      incidentId: input.incidentId,
      resolution: input.resolution,
      resolvedBy: personBehind(actor),
    });
    if (!resolved) throw new RuleError('not_found');
    return { incidentId: input.incidentId };
  },
  summarize: () => 'An incident resolved',
});
