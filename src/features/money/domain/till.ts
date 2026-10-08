import { RuleError } from '@/lib/rule-error';

// The till (docs/product/model.md, « La caisse »), pure: what it should hold, and its gap.

export interface TillFlows {
  /** What was in the till when it opened. */
  openingFloat: number;
  /** Cash taken for deposits. */
  cashIn: number;
  /** Cash given back on deposits. */
  cashRefunds: number;
  /** Expenses paid from the till. */
  expenses: number;
  /** What the owner took from the till. */
  draws: number;
  /** Cash carried to the bank. */
  bankDeposits: number;
}

/** What the till should hold: its float, what came in, minus all that went out. */
export function expectedCash(flows: TillFlows): number {
  return (
    flows.openingFloat +
    flows.cashIn -
    flows.cashRefunds -
    flows.expenses -
    flows.draws -
    flows.bankDeposits
  );
}

/** The gap of a counted till: counted minus expected. It is kept, never corrected. */
export function cashGap(counted: number, flows: TillFlows): number {
  return counted - expectedCash(flows);
}

/**
 * Whether cash may move: a team works with an open till — each cashier answers for hers; someone
 * alone may work without one.
 */
export function checkTill(staffing: 'solo' | 'team', hasOpenSession: boolean): void {
  if (staffing === 'team' && !hasOpenSession) throw new RuleError('cash_session_needed');
}

/** Cash cannot leave a till that does not hold it. */
export function checkCashOut(amount: number, flows: TillFlows): void {
  if (amount > expectedCash(flows)) {
    throw new RuleError('cash_not_in_till', { amount: Math.max(0, expectedCash(flows)) });
  }
}
