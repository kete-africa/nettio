import { ask, askStream, BudgetExceededError } from '@kete/ai';
import type { Caller } from '@kete/capabilities';
import type { ModelMessage } from 'ai';
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
4. You never change anything yourself. When — and only when — the person explicitly asks for a gesture (cash, cancel, refund, hand over, record an expense, issue an invoice, change a setting), you may PREPARE it by calling its tool: the tool then answers with status "draft". A draft does nothing until she verifies and confirms it herself. Say exactly that: what you prepared, and that it waits for her confirmation. Never say that something was done. Never prepare a gesture she did not ask for, and never one that sets or changes a price.
5. Answer in the language of the question, in two or three short sentences: the fact first, the figure with its unit (F CFA), then where it comes from. No exclamation mark, no emoji, no flattery.
6. Amounts are written like 1 103 000 F CFA.
7. If the question is not about this laundry, say you only answer about it.
8. Each question starts with today's date. "Ce mois-ci", "aujourd'hui", "hier" are read from it. A tool's month or day parameter left out means the current one: leave it out unless the person names another.`;

/** A turn of the conversation so far, as the screen keeps it. */
export interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

/** A gesture the assistant prepared: a draft that waits for the person. */
export interface Prepared {
  /** The capability that was prepared. */
  name: string;
  draftId: string;
}

export type AskOutcome =
  | { available: false; reason: 'not_connected' | 'budget_spent' }
  | {
      available: true;
      answer: string;
      /** The readings the answer rests on, in the order they were called. */
      sources: string[];
      /** The gestures prepared for the person to confirm; nothing was done. */
      prepared: Prepared[];
    };

/** What happens while an answer is written, for a screen that shows it as it comes. */
export type AssistantEvent =
  | { type: 'text'; delta: string }
  | { type: 'reading'; name: string }
  | { type: 'prepared'; name: string; draftId: string }
  | { type: 'unavailable'; reason: 'not_connected' | 'budget_spent' | 'failed' }
  | { type: 'done' };

const HISTORY = 12;

/** What sets a price or a rate: never offered to the model — Nettio neither sets nor advises one. */
const NEVER_OFFERED = new Set([
  'catalog_set_price',
  'catalog_save_pack',
  'team_set_rate',
  'accounts_set_price',
  'subscriptions_start',
  'unclaimed_set_rules',
  'delivery_set_zone',
]);

/**
 * What a turn is made of. The model is offered the readings the person may open herself, and the
 * gestures she may do — which, called by an agent, only prepare a draft she must confirm (levels 3
 * and 4). Level 2 gestures act at once: the assistant is never offered them. It receives the
 * conversation and what its tools returned, never the database.
 */
async function turnOf(
  person: { userId: string; organizationId: string },
  input: { question: string; history?: Turn[]; screen?: string | undefined; readOnly?: boolean },
) {
  const model = getModel();
  if (!model) return null;
  const caller: Caller = {
    organizationId: person.organizationId,
    actor: {
      kind: 'agent',
      id: ASSISTANT,
      channel: 'chat',
      onBehalfOf: { kind: 'person', id: person.userId },
    },
  };
  const tools = (await registry.tools(caller)).filter(
    (tool) =>
      (input.readOnly ? tool.autonomy === 1 : tool.autonomy !== 2) && !NEVER_OFFERED.has(tool.name),
  );
  const messages: ModelMessage[] = [
    ...(input.history ?? [])
      .slice(-HISTORY)
      .map((turn): ModelMessage => ({ role: turn.role, content: turn.text.slice(0, 2000) })),
    {
      role: 'user',
      // The model does not know the date: without it, « ce mois-ci » is a month of its own.
      content: [
        `[Today: ${new Date().toISOString().slice(0, 10)}]`,
        ...(input.screen ? [`[Screen open: ${input.screen}]`] : []),
        input.question,
      ].join('\n'),
    },
  ];
  return {
    model,
    system: SYSTEM,
    messages,
    tools,
    maxSteps: 6,
    metering: {
      store: getBudgets(),
      context: { organizationId: person.organizationId, actor: caller.actor, purpose: 'ask', model: '' },
    },
  };
}

/** What a tool call became: a reading that was read, or a gesture that was prepared. */
function outcomeOf(name: string, output: unknown): AssistantEvent | null {
  const result = output as { status?: string; draftId?: string } | null;
  if (result?.status === 'draft' && typeof result.draftId === 'string') {
    return { type: 'prepared', name, draftId: result.draftId };
  }
  if (result?.status === 'done') return { type: 'reading', name };
  return null;
}

/**
 * Answers a question for a person, in one piece: for messaging, a copilot, the tests and the
 * evaluation. To run within her rights (`asPerson`).
 */
export async function askNettio(
  person: { userId: string; organizationId: string },
  question: string,
  /** Where she is in the app, when she asks from a screen. */
  screen?: string,
  history: Turn[] = [],
  /** By message: readings only — a prepared gesture could not be confirmed there. */
  options: { readOnly?: boolean } = {},
): Promise<AskOutcome> {
  const turn = await turnOf(person, { question, history, screen, readOnly: options.readOnly === true });
  if (!turn) return { available: false, reason: 'not_connected' };
  try {
    const answer = await ask(turn);
    const events = answer.toolResults.map((result) => outcomeOf(result.name, result.output));
    return {
      available: true,
      answer: answer.text.trim(),
      sources: [...new Set(events.flatMap((event) => (event?.type === 'reading' ? [event.name] : [])))],
      prepared: events.flatMap((event) =>
        event?.type === 'prepared' ? [{ name: event.name, draftId: event.draftId }] : [],
      ),
    };
  } catch (error) {
    if (error instanceof BudgetExceededError) return { available: false, reason: 'budget_spent' };
    throw error;
  }
}

/**
 * The same answer, as it is written: its words as they come, each reading it opens, each gesture
 * it prepares. To run within the person's rights (`asPerson`), for the whole life of the stream.
 */
export async function* converse(
  person: { userId: string; organizationId: string },
  input: { question: string; history?: Turn[]; screen?: string | undefined },
): AsyncGenerator<AssistantEvent> {
  const turn = await turnOf(person, input);
  if (!turn) {
    yield { type: 'unavailable', reason: 'not_connected' };
    return;
  }
  try {
    const result = await askStream(turn);
    for await (const part of result.fullStream as AsyncIterable<Record<string, unknown>>) {
      if (part.type === 'text-delta') {
        const delta = (part.text ?? part.textDelta ?? part.delta) as string | undefined;
        if (delta) yield { type: 'text', delta };
      } else if (part.type === 'tool-result') {
        const event = outcomeOf(String(part.toolName), part.output ?? part.result);
        if (event) yield event;
      } else if (part.type === 'error') {
        throw part.error instanceof Error ? part.error : new Error('stream');
      }
    }
    yield { type: 'done' };
  } catch (error) {
    yield {
      type: 'unavailable',
      reason: error instanceof BudgetExceededError ? 'budget_spent' : 'failed',
    };
  }
}
