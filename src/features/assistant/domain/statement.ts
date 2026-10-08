// The day's statement (specs/007-intelligence): what the owner reads in the evening without
// calling anyone. A pure function: figures computed by code, sentences made of fixed words. No
// model writes any of it (constitution II).

export interface StatementFacts {
  /** What was cashed today: payments minus refunds. */
  cashed: number;
  received: number;
  pieces: number;
  /** Ready and waiting for their customers. */
  ready: number;
  dormant: number;
  late: number;
  /** What customers still owe. */
  outstanding: number;
  /** Deposits of the month sold under the variable cost of their content. */
  belowCost: number;
  openTills: number;
  /** The tills closed today, with their gap. */
  closedTills: { cashier: string; gap: number }[];
  openIncidents: number;
  /** The month so far. */
  month: { cashed: number; charges: number; result: number; draws: number; left: number };
}

/** The words of the statement, in the reader's language; amounts arrive already said. */
export interface StatementWords {
  money(amount: number): string;
  signed(amount: number): string;
  cashed(input: { amount: string; received: number; pieces: number }): string;
  nothing(): string;
  ready(input: { count: number }): string;
  late(input: { count: number }): string;
  dormant(input: { count: number }): string;
  outstanding(input: { amount: string }): string;
  belowCost(input: { count: number }): string;
  tillRight(input: { cashier: string }): string;
  tillGap(input: { cashier: string; gap: string }): string;
  tillsOpen(input: { count: number }): string;
  incidents(input: { count: number }): string;
  month(input: { cashed: string; charges: string; result: string }): string;
  draws(input: { draws: string; left: string }): string;
}

/** The statement, line by line: the day first, what needs a look, then the month so far. */
export function dayStatement(facts: StatementFacts, words: StatementWords): string[] {
  const lines: string[] = [];
  lines.push(
    facts.received === 0 && facts.cashed === 0
      ? words.nothing()
      : words.cashed({
          amount: words.money(facts.cashed),
          received: facts.received,
          pieces: facts.pieces,
        }),
  );
  if (facts.ready > 0) lines.push(words.ready({ count: facts.ready }));
  if (facts.late > 0) lines.push(words.late({ count: facts.late }));
  if (facts.dormant > 0) lines.push(words.dormant({ count: facts.dormant }));
  if (facts.outstanding > 0) lines.push(words.outstanding({ amount: words.money(facts.outstanding) }));
  if (facts.belowCost > 0) lines.push(words.belowCost({ count: facts.belowCost }));
  for (const till of facts.closedTills) {
    lines.push(
      till.gap === 0
        ? words.tillRight({ cashier: till.cashier })
        : words.tillGap({ cashier: till.cashier, gap: words.signed(till.gap) }),
    );
  }
  if (facts.openTills > 0) lines.push(words.tillsOpen({ count: facts.openTills }));
  if (facts.openIncidents > 0) lines.push(words.incidents({ count: facts.openIncidents }));
  lines.push(
    words.month({
      cashed: words.money(facts.month.cashed),
      charges: words.money(facts.month.charges),
      result: words.signed(facts.month.result),
    }),
  );
  if (facts.month.draws > 0) {
    lines.push(
      words.draws({ draws: words.money(facts.month.draws), left: words.signed(facts.month.left) }),
    );
  }
  return lines;
}
