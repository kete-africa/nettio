import { defineCommand } from '@kete/commands';
import { readCatalog } from '@/features/catalog';
import { RuleError } from '@/lib/rule-error';
import { saveRate } from './infrastructure/team.tables';
import { rateInput } from './team.record';

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
