// The evening statement sent by itself (specs/013-statement-sent): when it is due, and what one
// sending became on each channel. Pure functions: no clock, no network, no database.

export const statementChannels = ['email', 'whatsapp', 'telegram'] as const;
export type StatementChannel = (typeof statementChannels)[number];

/** What a sending became on a channel — and why, in a word the screen puts into a sentence. */
export interface SendingOutcome {
  channel: StatementChannel;
  status: 'sent' | 'failed' | 'not_connected';
  reason: string;
}

/** What the laundry decided: whether its statement leaves by itself, when, and where to. */
export interface DeliveryChoice {
  enabled: boolean;
  /** The hour of the day it leaves at, 0 to 23, in universal time (the time of Lomé). */
  hour: number;
  email: string;
  whatsapp: string;
  telegramLinked: boolean;
}

/** Where a statement may leave to: the destinations the laundry gave, in a fixed order. */
export function destinationsOf(choice: DeliveryChoice): StatementChannel[] {
  return statementChannels.filter((channel) =>
    channel === 'email'
      ? choice.email !== ''
      : channel === 'whatsapp'
        ? choice.whatsapp !== ''
        : choice.telegramLinked,
  );
}

/**
 * Whether the statement of `now`'s day is due: turned on, with somewhere to go, its hour reached,
 * and not sent today yet. An hour that was missed (the worker was down) is caught up the same
 * day; a day that ended without it is not sent the day after — its figures would be another day's.
 */
export function statementIsDue(
  choice: DeliveryChoice & { lastSentOn: string | null },
  now: Date,
): boolean {
  if (!choice.enabled || destinationsOf(choice).length === 0) return false;
  if (now.getUTCHours() < choice.hour) return false;
  return choice.lastSentOn !== now.toISOString().slice(0, 10);
}

/**
 * The statement as one value of a provider's approved template: a messaging provider that only
 * lets a business write first with a template refuses line breaks and runs of spaces in a value.
 */
export function asOneValue(lines: string[], most = 1000): string {
  const joined = lines
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' — ');
  return joined.length <= most ? joined : `${joined.slice(0, most - 1).trimEnd()}…`;
}

/** The statement as a message: the laundry's name, the day, then one fact per line. */
export function asMessage(input: { business: string; day: string; lines: string[] }): string {
  return [`${input.business} — ${input.day}`, ...input.lines].join('\n');
}
