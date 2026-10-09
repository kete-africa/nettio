import type { SqlExecutor } from '@kete/tenancy';
import { intentOf } from '@/features/messaging/domain/messages';
import { askNettio } from './ask';
import {
  ASK_TOKEN,
  peopleOfAddress,
  personOfMessagingToken,
  tieAddress,
  untieMessaging,
  type AskChannel,
} from './infrastructure/messaging-link.tables';

/** The words Nettio answers a person of the team with; supplied by the application layer. */
export interface AskWords {
  tied(): string;
  untied(): string;
  notConnected(): string;
  budgetSpent(): string;
  notAllowed(): string;
}

/** What the messaging path needs from the deployment. */
export interface AskByMessagingPorts {
  /** A connection outside any organization: it may only call the lookup functions. */
  lookup: SqlExecutor;
  inOrganization<T>(organizationId: string, work: (db: SqlExecutor) => Promise<T>): Promise<T>;
  /**
   * Runs `work` with the rights of a person of the team, read from her business role — or says
   * she holds none (retired, no role): then nothing is answered.
   */
  asStaff<T>(
    person: { organizationId: string; userId: string },
    work: (may: (permission: string) => boolean) => Promise<T>,
  ): Promise<T | null>;
  reply(text: string): Promise<void>;
  words: AskWords;
}

/** The token alone (WhatsApp), or after Telegram's `/start`. */
const tokenIn = (text: string): string | null => {
  const found = /^(?:\/start\s+)?(ask_[A-Za-z0-9_-]{8,64})$/.exec(text.trim());
  return found?.[1]?.startsWith(ASK_TOKEN) ? found[1] : null;
};

/**
 * A message that may come from a person of the team (specs/023-ask-by-messaging). Her token ties
 * the address she writes from; « stop » unties it; anything else is a question, answered with
 * the readings she may open — nothing that changes anything: a gesture cannot be confirmed by
 * message. Returns false when the sender is nobody of a team: the message is then a customer's.
 */
export async function heardFromStaff(
  input: { channel: AskChannel; sender: string; text: string },
  ports: AskByMessagingPorts,
): Promise<boolean> {
  const token = tokenIn(input.text);
  if (token) {
    const person = await personOfMessagingToken(ports.lookup, token);
    // A token nobody was shown: nothing is said, and nothing else is tried with it.
    if (!person) return true;
    const tied = await ports.inOrganization(person.organizationId, (db) =>
      tieAddress(db, token, input.channel, input.sender),
    );
    if (tied) await ports.reply(ports.words.tied());
    return true;
  }
  const people = await peopleOfAddress(ports.lookup, input.channel, input.sender);
  const [person] = people;
  if (!person) return false;
  if (intentOf(input.text).kind === 'stop') {
    for (const each of people) {
      await ports.inOrganization(each.organizationId, (db) => untieMessaging(db, each.userId));
    }
    await ports.reply(ports.words.untied());
    return true;
  }
  const answer = await ports.asStaff(person, async (may) => {
    if (!may('assistant:ask')) return ports.words.notAllowed();
    const outcome = await askNettio(person, input.text.slice(0, 500), undefined, [], { readOnly: true });
    if (outcome.available) return outcome.answer;
    return outcome.reason === 'budget_spent' ? ports.words.budgetSpent() : ports.words.notConnected();
  });
  // Someone who left the team, or holds no role: silence — not even that Nettio knows her.
  if (answer) await ports.reply(answer.slice(0, 3500));
  return true;
}
