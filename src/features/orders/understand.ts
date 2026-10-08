import { BudgetExceededError, extract } from '@kete/ai';
import { NoTranscriptGeneratedError, transcribe } from 'ai';
import { z } from 'zod';
import { getBudgets, getModel, getTranscriber } from '@/platform/ai';
import { catalogForModel, settle, type HeardCatalog, type Understood } from './domain/understand';

/** The agent that places a clerk's words on the catalogue; it acts for her, and saves nothing. */
export const LISTENER = 'agt_nettio_listen';

/** What the model must return: identifiers of the catalogue, and the words it could not place. */
const heardSchema = z.object({
  phone: z.string().nullable().describe('The customer phone as said, digits only; null if none.'),
  customerName: z.string().nullable().describe('The customer name as said; null if none.'),
  lines: z.array(
    z.object({
      serviceId: z.string(),
      articleId: z.string().nullable(),
      quantity: z.number(),
      defects: z.string().nullable().describe('A defect said for this piece (a stain, a missing button); null if none.'),
    }),
  ),
  packId: z.string().nullable(),
  express: z.boolean(),
  notFound: z.array(z.string()),
});

export const LISTEN_SYSTEM = `You turn what a laundry counter clerk said or typed into the lines of a deposit.

Rules:
1. Use ONLY the identifiers of the catalogue you are given. Never invent a service, an article or a pack.
2. A line pairs an article with a service. When no service is said, use the default service.
3. Quantities are exactly what was said. Never guess one. Pieces are whole numbers; a per-kilo service takes kilos and no article.
4. What you cannot place in the catalogue goes to notFound, in the clerk's own words — never into a line.
5. A phone number and a name only when they were said. A pack only when one was named. express only when it was said.
6. You never give a price, a total or an opinion.`;

export type UnderstandOutcome =
  | { available: false; reason: 'not_connected' | 'no_voice' | 'budget_spent' | 'nothing_heard' }
  | { available: true; heard: string; understood: Understood };

/**
 * Understands a deposit from a sentence — typed, or dictated. The model places the words; the
 * code keeps only what the catalogue sells (\`settle\`). Nothing is saved: the result fills the
 * counter's form, and the person checks and saves it herself. The audio is read once, never kept.
 */
export async function understandDeposit(
  person: { userId: string; organizationId: string },
  said: { text: string } | { audio: Uint8Array },
  catalog: HeardCatalog,
): Promise<UnderstandOutcome> {
  const model = getModel();
  if (!model) return { available: false, reason: 'not_connected' };
  const context = {
    organizationId: person.organizationId,
    actor: {
      kind: 'agent' as const,
      id: LISTENER,
      channel: 'chat' as const,
      onBehalfOf: { kind: 'person' as const, id: person.userId },
    },
    model: '',
  };
  const store = getBudgets();
  try {
    let text: string;
    if ('audio' in said) {
      const transcriber = getTranscriber();
      if (!transcriber) return { available: false, reason: 'no_voice' };
      await store.check(context);
      try {
        text = (await transcribe({ model: transcriber, audio: said.audio })).text.trim();
      } catch (error) {
        // A recording with no word in it: said as such, not as a failure.
        if (!NoTranscriptGeneratedError.isInstance(error)) throw error;
        text = '';
      }
      // The call was made, heard or not: it is counted.
      await store.record(
        { ...context, purpose: 'deposit_voice', model: `${transcriber.provider}:${transcriber.modelId}` },
        { inputTokens: 0, outputTokens: 0, modelCalls: 1 },
      );
    } else {
      text = said.text.trim();
    }
    if (text.length < 2) return { available: false, reason: 'nothing_heard' };
    const { value } = await extract({
      model,
      schema: heardSchema,
      system: LISTEN_SYSTEM,
      prompt: `Catalogue:\n${catalogForModel(catalog)}\n\nThe clerk said:\n"""${text.slice(0, 1500)}"""`,
      metering: { store, context: { ...context, purpose: 'deposit_entry' } },
    });
    return { available: true, heard: text, understood: settle(value, catalog) };
  } catch (error) {
    if (error instanceof BudgetExceededError) return { available: false, reason: 'budget_spent' };
    throw error;
  }
}
