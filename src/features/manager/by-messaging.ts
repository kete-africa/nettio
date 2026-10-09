import type { SqlExecutor } from '@kete/tenancy';
import type { ApprovalKind } from './domain/manager';
import { approvalsToTell, markTold, pendingByCode, type Approval } from './infrastructure/manager.tables';

// A manager's approvals on her own WhatsApp or Telegram (specs/025-manager): she is told what is
// asked, and answers « OUI 12 » or « NON 12 ». It is her decision — written from the address she
// tied herself, journaled in her name with its channel — never an agent's.

export type DecisionChannel = 'whatsapp' | 'telegram';

/** The words of these messages; supplied by the application layer. */
export interface DecisionWords {
  asked(facts: {
    kind: ApprovalKind;
    amount: number;
    number: string;
    customer: string;
    reason: string;
    by: string;
    code: number;
  }): string;
  granted(number: string): string;
  refused(number: string): string;
  unknown(code: number): string;
  notAllowed(): string;
  /** The sentence of a rule that stopped the decision. */
  stopped(code: string): string;
}

export interface TellPorts {
  /** Who decides in this laundry: the people whose role holds the right. */
  deciders(db: SqlExecutor): Promise<{ userId: string; name: string }[]>;
  names(db: SqlExecutor): Promise<Map<string, string>>;
  addresses(
    db: SqlExecutor,
    userIds: string[],
  ): Promise<{ userId: string; telegram: string | null; whatsapp: string | null }[]>;
  /** Sends on a connected channel; false when it is not connected or refused. */
  send(channel: DecisionChannel, to: string, text: string): Promise<boolean>;
  words: DecisionWords;
}

/**
 * Tells those who decide about the requests that wait, once each, on every address they tied —
 * WhatsApp and Telegram both. Whoever asked is not told about her own request. Returns how many
 * messages left.
 */
export async function tellDeciders(db: SqlExecutor, ports: TellPorts): Promise<number> {
  const waiting = await approvalsToTell(db);
  if (waiting.length === 0) return 0;
  const deciders = await ports.deciders(db);
  const addresses = await ports.addresses(db, deciders.map((person) => person.userId));
  const names = await ports.names(db);
  let sent = 0;
  for (const approval of waiting) {
    const text = ports.words.asked({
      kind: approval.kind,
      amount: approval.amount,
      number: approval.orderNumber,
      customer: approval.customerName,
      reason: approval.reason,
      by: names.get(approval.requestedBy) ?? '',
      code: approval.replyCode,
    });
    for (const address of addresses) {
      if (address.userId === approval.requestedBy) continue;
      if (address.whatsapp && (await ports.send('whatsapp', address.whatsapp, text))) sent += 1;
      if (address.telegram && (await ports.send('telegram', address.telegram, text))) sent += 1;
    }
  }
  // Told or not — nobody tied an address, a channel is not connected —, it is not tried forever:
  // the request waits on the manager's board either way.
  await markTold(db, waiting.map((approval) => approval.approvalId));
  return sent;
}

export interface DecidePorts {
  /** The people who tied this address (identifiers only). */
  people(channel: DecisionChannel, sender: string): Promise<{ organizationId: string; userId: string }[]>;
  inOrganization<T>(organizationId: string, work: (db: SqlExecutor) => Promise<T>): Promise<T>;
  asStaff<T>(
    person: { organizationId: string; userId: string },
    work: (may: (permission: string) => boolean) => Promise<T>,
  ): Promise<T | null>;
  /** The decision itself, as the person, through the same gesture as her screen. */
  decide(
    person: { organizationId: string; userId: string },
    channel: DecisionChannel,
    input: { approvalId: string; approve: boolean },
  ): Promise<{ ok: true } | { ok: false; code: string }>;
  reply(text: string): Promise<void>;
  words: DecisionWords;
}

/** « OUI 12 », « non 12 », « ok #12 »: a decision and the request's number, nothing else. */
export function decisionIn(text: string): { approve: boolean; code: number } | null {
  const found = /^\s*(oui|ok|yes|non|no)\s*#?\s*(\d{1,6})\s*[.!]?\s*$/i.exec(text);
  if (!found) return null;
  return { approve: !/^no/i.test(found[1] ?? ''), code: Number(found[2]) };
}

/**
 * A message that may be a manager's decision. Returns false when it is not one — not these
 * words, or not from an address someone of a team tied: the message is then read as any other.
 */
export async function decidedByMessage(
  input: { channel: DecisionChannel; sender: string; text: string },
  ports: DecidePorts,
): Promise<boolean> {
  const decision = decisionIn(input.text);
  if (!decision) return false;
  const [person] = await ports.people(input.channel, input.sender);
  if (!person) return false;
  const answer = await ports.asStaff(person, async (may) => {
    if (!may('approvals:decide')) return ports.words.notAllowed();
    const approval: Approval | null = await ports.inOrganization(person.organizationId, (db) =>
      pendingByCode(db, decision.code),
    );
    if (!approval) return ports.words.unknown(decision.code);
    const outcome = await ports.decide(person, input.channel, {
      approvalId: approval.approvalId,
      approve: decision.approve,
    });
    if (!outcome.ok) return ports.words.stopped(outcome.code);
    return decision.approve ? ports.words.granted(approval.orderNumber) : ports.words.refused(approval.orderNumber);
  });
  // Someone who left the team: silence.
  if (answer) await ports.reply(answer);
  return true;
}
