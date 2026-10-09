import { defineCommand } from '@kete/commands';
import { readCatalog } from '@/features/catalog';
import { listSites } from '@/features/business';
import { personBehind } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { closeClocking, openClocking } from './infrastructure/presence.tables';
import { saveRate } from './infrastructure/team.tables';
import { clockInInput, clockOutInput, rateInput } from './team.record';

/**
 * Sets what the laundry pays for one piece passed at a step — or removes it. The owner's
 * decision: Nettio proposes no rate.
 */
export const setPieceRate = defineCommand({
  name: 'set-piece-rate',
  input: rateInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const { steps } = await readCatalog(db);
    if (!steps.some((step) => step.stepId === input.stepId)) throw new RuleError('not_found');
    await saveRate(db, organizationId, input);
    return { stepId: input.stepId, amount: input.amount };
  },
  summarize: (input) =>
    input.amount === null ? 'A step is no longer paid by the piece' : `Piece rate set: ${input.amount}`,
});

/** A person says she starts work: hers to say, for herself only. */
export const clockIn = defineCommand({
  name: 'clock-in',
  input: clockInInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    if (input.siteId && !(await listSites(db)).some((site) => site.siteId === input.siteId)) {
      throw new RuleError('not_found');
    }
    const opened = await openClocking(db, organizationId, {
      userId: personBehind(actor),
      siteId: input.siteId,
    });
    if (!opened) throw new RuleError('already_clocked_in');
    return { present: true };
  },
  summarize: () => 'Clocked in',
});

/** A person says she is done for now. */
export const clockOut = defineCommand({
  name: 'clock-out',
  input: clockOutInput,
  reversibility: { reversible: false },
  async handler(_input, { db, actor }) {
    const closed = await closeClocking(db, personBehind(actor));
    if (!closed) throw new RuleError('not_clocked_in');
    return {
      present: false,
      minutes: Math.floor((closed.endedAt.getTime() - closed.startedAt.getTime()) / 60_000),
    };
  },
  summarize: (_input, output) => `Clocked out after ${output.minutes} min`,
});
