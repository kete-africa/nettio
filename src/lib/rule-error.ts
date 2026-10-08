/**
 * A rule of the business that a gesture broke: a code the screens word in clear (what happened,
 * why, what to do) and an agent reads as is. Thrown by a domain function or a command; the
 * command's transaction rolls back.
 */
export class RuleError extends Error {
  constructor(
    readonly code: string,
    /** Facts the message names: a label, an amount. Never a secret. */
    readonly facts: Record<string, string | number> = {},
  ) {
    super(code);
    this.name = 'RuleError';
  }
}

/** What a gesture gave a screen: its output, or the code of what stopped it. */
export type Outcome<T> =
  | { ok: true; output: T }
  | { ok: false; code: string; facts: Record<string, string | number> };
