// The work of each person in the workshop, and what it earns at the laundry's piece rates
// (specs/015-team-pay). Pure: the steps were signed in the workshop; this file only counts them.
// Nettio sets no rate — the owner does, step by step, or leaves a step unpaid by the piece.

/** What one person did at one step in a period: pieces (or kilos) passed, and passed again. */
export interface WorkLine {
  userId: string;
  stepId: string;
  stepName: string;
  /** The quantity of the units she passed at this step for the first time. */
  pieces: number;
  /** The quantity passed again after a rework: counted apart, never paid twice. */
  redone: number;
}

export interface PayLine {
  stepId: string;
  stepName: string;
  pieces: number;
  redone: number;
  /** The laundry's rate for one piece at this step; null while it gave none. */
  rate: number | null;
  amount: number;
}

export interface PersonPay {
  userId: string;
  name: string;
  lines: PayLine[];
  /** What her pieces earn at the rates. */
  earned: number;
  /** What she was already handed in the period: advances and pay. */
  paid: number;
  /** earned − paid: what is left to hand her, or what she was handed ahead (negative). */
  left: number;
  /** Pieces at steps that have no rate: done, and not in `earned`. */
  unrated: number;
}

const round3 = (value: number) => Math.round(value * 1000) / 1000;

/**
 * The pay of each person: her pieces at each step times that step's rate, minus what she was
 * handed. A person who was only handed money (no step signed) appears too: an advance is never
 * lost. Sorted by name.
 */
export function payOf(input: {
  work: WorkLine[];
  rates: ReadonlyMap<string, number>;
  paid: ReadonlyMap<string, number>;
  names: ReadonlyMap<string, string>;
}): PersonPay[] {
  const people = new Map<string, PersonPay>();
  const of = (userId: string): PersonPay => {
    let person = people.get(userId);
    if (!person) {
      person = {
        userId,
        name: input.names.get(userId) ?? userId,
        lines: [],
        earned: 0,
        paid: 0,
        left: 0,
        unrated: 0,
      };
      people.set(userId, person);
    }
    return person;
  };
  for (const line of input.work) {
    const person = of(line.userId);
    const rate = input.rates.get(line.stepId) ?? null;
    const amount = rate === null ? 0 : Math.round(line.pieces * rate);
    person.lines.push({
      stepId: line.stepId,
      stepName: line.stepName,
      pieces: round3(line.pieces),
      redone: round3(line.redone),
      rate,
      amount,
    });
    person.earned += amount;
    if (rate === null) person.unrated = round3(person.unrated + line.pieces);
  }
  for (const [userId, amount] of input.paid) of(userId).paid += amount;
  for (const person of people.values()) person.left = person.earned - person.paid;
  return [...people.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'));
}

/** A month as a period: its first day, and the first day of the next. */
export function monthPeriod(month: string): { from: string; to: string } {
  const [year, index] = month.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(year, index, 1));
  return { from: `${month}-01`, to: next.toISOString().slice(0, 10) };
}
