import { ask, BudgetExceededError } from '@kete/ai';
import type { Caller } from '@kete/capabilities';
import { getBudgets, getModel } from '@/platform/ai';
import { registry } from '@/platform/registry';

/** The assistant of Nettio: an agent that acts for the person who asks, never more than her. */
export const ASSISTANT = 'agt_nettio_ask';

/**
 * What the model is, and what it must never do (docs/product/voix.md, « Les réponses de
 * Demander »). Written for the model, in English; it answers in the person's language.
 */
export const SYSTEM = `You answer the questions of someone who works in a laundry (a "pressing") that uses Nettio.

Rules, in this order:
1. Every figure you give comes from a tool result of this conversation. You never compute, add, average, round or estimate a figure yourself. If a tool did not return it, you do not have it.
2. When a tool says something is not measured or missing (null, "never", "partial"), say so plainly: "Je ne sais pas" and what is missing. Never fill the gap.
3. You never advise, suggest or judge a price, a discount or a pack. A pack sold at a loss may be a choice: state the figure, nothing more.
4. You only read. You cannot cash, cancel, refund, hand over, message a customer nor change anything; if asked, say where in Nettio the person does it herself.
5. Answer in the language of the question, in two or three short sentences: the fact first, the figure with its unit (F CFA), then where it comes from. No exclamation mark, no emoji, no flattery.
6. Amounts are written like 1 103 000 F CFA.
7. If the question is not about this laundry, say you only answer about it.`;

export type AskOutcome =
  | { available: false; reason: 'not_connected' | 'budget_spent' }
  | {
      available: true;
      answer: string;
      /** The readings the answer rests on, in the order they were called. */
      sources: string[];
    };

/**
 * Answers a question for a person. The model is offered only the readings (level 1) she may open
 * herself: it cannot reach what she cannot, and nothing that changes anything — not even a draft.
 * It receives the question and what the readings returned, never the database. To run within her
 * rights (`asPerson`).
 */
export async function askNettio(
  person: { userId: string; organizationId: string },
  question: string,
  /** Where she is in the app, when she asks from a screen. */
  screen?: string,
): Promise<AskOutcome> {
  const model = getModel();
  if (!model) return { available: false, reason: 'not_connected' };
  const caller: Caller = {
    organizationId: person.organizationId,
    actor: {
      kind: 'agent',
      id: ASSISTANT,
      channel: 'chat',
      onBehalfOf: { kind: 'person', id: person.userId },
    },
  };
  const readings = (await registry.tools(caller)).filter((tool) => tool.autonomy === 1);
  try {
    const answer = await ask({
      model,
      system: SYSTEM,
      prompt: screen ? `[Screen open: ${screen}]\n${question}` : question,
      tools: readings,
      maxSteps: 6,
      metering: {
        store: getBudgets(),
        context: { organizationId: person.organizationId, actor: caller.actor, purpose: 'ask', model: '' },
      },
    });
    return {
      available: true,
      answer: answer.text.trim(),
      sources: [...new Set(answer.toolResults.map((result) => result.name))],
    };
  } catch (error) {
    if (error instanceof BudgetExceededError) return { available: false, reason: 'budget_spent' };
    throw error;
  }
}
