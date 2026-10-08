import { defineCommand } from '@kete/commands';
import type { SqlExecutor } from '@kete/tenancy';
import { findStaffOf, listSites, readSettings, receives } from '@/features/business';
import { readCatalog } from '@/features/catalog';
import { personBehind } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { holds } from '@/platform/rights';
import { belowVariableCost, indexSheets, type CostedLine } from './domain/costs';
import { cashGap, checkCashOut, checkTill, expectedCash } from './domain/till';
import {
  closeSession,
  findExpense,
  findSession,
  insertBankDeposit,
  insertDraw,
  insertExpense,
  insertSession,
  listSheets,
  openSessionOf,
  saveSheet,
  stopExpense,
  voidExpense,
} from './infrastructure/money.tables';
import {
  bankDepositInput,
  closeSessionInput,
  costSheetInput,
  drawInput,
  expenseInput,
  openSessionInput,
  stopExpenseInput,
  voidExpenseInput,
  type CashSession,
} from './money.record';

/**
 * The till cash goes into, or comes out of, for a person at a site: her open one. A team works
 * with an open till; someone alone may work without one (then cash is counted in no till).
 */
export async function tillFor(
  db: SqlExecutor,
  input: { cashierId: string; siteId: string },
): Promise<CashSession | null> {
  const settings = await readSettings(db);
  if (!settings) throw new RuleError('not_set_up');
  const session = await openSessionOf(db, input.cashierId, input.siteId);
  checkTill(settings.staffing, session !== null);
  return session;
}

/** The till cash comes out of: it must hold what leaves it. */
async function tillToPayFrom(
  db: SqlExecutor,
  input: { cashierId: string; siteId: string | null; amount: number },
): Promise<string | null> {
  if (!input.siteId) throw new RuleError('site_needed');
  const session = await tillFor(db, { cashierId: input.cashierId, siteId: input.siteId });
  if (session) checkCashOut(input.amount, session);
  return session?.sessionId ?? null;
}

/**
 * The counter's guard-rail: whether a deposit's total falls under the variable cost of its
 * content. Null when a line has no cost sheet: nothing is said rather than guessed.
 */
export async function guardRail(
  db: SqlExecutor,
  total: number,
  lines: CostedLine[],
): Promise<{ below: boolean; variableCost: number } | null> {
  const settings = await readSettings(db);
  if (!settings) return null;
  return belowVariableCost(total, lines, indexSheets(await listSheets(db)), settings);
}

/** Opens a till with its float: one per site and per cashier. */
export const openCashSession = defineCommand({
  name: 'open-cash-session',
  input: openSessionInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const site = (await listSites(db)).find((s) => s.siteId === input.siteId);
    if (!site?.active) throw new RuleError('not_found');
    if (!receives(site.kind)) throw new RuleError('site_does_not_receive');
    const cashierId = personBehind(actor);
    if (await openSessionOf(db, cashierId, site.siteId)) throw new RuleError('cash_session_open');
    const sessionId = await insertSession(db, organizationId, {
      siteId: site.siteId,
      cashierId,
      openingFloat: input.openingFloat,
    });
    return { sessionId };
  },
  summarize: (input) => `A till opened with a float of ${input.openingFloat}`,
});

async function ownOpenSession(db: SqlExecutor, sessionId: string, person: string) {
  const session = await findSession(db, sessionId);
  if (!session) throw new RuleError('not_found');
  if (session.closedAt) throw new RuleError('cash_session_closed');
  // A till is its cashier's; whoever reads the money may close one left open.
  if (session.cashierId !== person && !holds('money:read')) throw new RuleError('not_your_till');
  return session;
}

/** Closes a till: what was counted, what was expected, the gap — kept, never corrected. */
export const closeCashSession = defineCommand({
  name: 'close-cash-session',
  input: closeSessionInput,
  reversibility: { reversible: false },
  async handler(input, { db, actor }) {
    const session = await ownOpenSession(db, input.sessionId, personBehind(actor));
    const expected = expectedCash(session);
    const gap = cashGap(input.counted, session);
    await closeSession(db, {
      sessionId: session.sessionId,
      expected,
      counted: input.counted,
      gap,
      note: input.note,
    });
    return { sessionId: session.sessionId, expected, counted: input.counted, gap };
  },
  summarize: (_input, output) => `A till closed: gap ${output.gap}`,
});

/** Carries cash from a till to the bank. */
export const depositCashAtBank = defineCommand({
  name: 'deposit-cash-at-bank',
  input: bankDepositInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const person = personBehind(actor);
    const session = await ownOpenSession(db, input.sessionId, person);
    checkCashOut(input.amount, session);
    await insertBankDeposit(db, organizationId, { ...input, createdBy: person });
    return { sessionId: session.sessionId, expected: expectedCash(session) - input.amount };
  },
  summarize: (input) => `${input.amount} carried to the bank`,
});

/** Records something that goes out: fixed or variable, one-off or every month. */
export const recordExpense = defineCommand({
  name: 'record-expense',
  input: expenseInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const person = personBehind(actor);
    if (input.recurring && input.paidFrom === 'till') {
      throw new RuleError('recurring_not_from_till');
    }
    if (input.siteId && !(await listSites(db)).some((site) => site.siteId === input.siteId)) {
      throw new RuleError('not_found');
    }
    // Money handed to a person of the team is wages, on its day — never a monthly line.
    if (input.paidTo) {
      if (input.category !== 'wages' || input.recurring) throw new RuleError('paid_to_needs_wages');
      if (!(await findStaffOf(db, input.paidTo))) throw new RuleError('not_found');
    }
    const cashSessionId =
      input.paidFrom === 'till'
        ? await tillToPayFrom(db, { cashierId: person, siteId: input.siteId, amount: input.amount })
        : null;
    const expenseId = await insertExpense(db, organizationId, {
      ...input,
      cashSessionId,
      createdBy: person,
    });
    return { expenseId };
  },
  summarize: (input) => `Expense recorded: ${input.category}, ${input.amount}`,
});

/** Voids an expense recorded by mistake: it stays in the list, marked, and counts nowhere. */
export const voidExpenseCommand = defineCommand({
  name: 'void-expense',
  input: voidExpenseInput,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    const expense = await findExpense(db, input.expenseId);
    if (!expense) throw new RuleError('not_found');
    if (expense.voided) throw new RuleError('expense_voided');
    await voidExpense(db, expense.expenseId, input.reason);
    return { expenseId: expense.expenseId };
  },
  summarize: () => 'An expense voided',
});

/** Stops a recurring charge: it counts until the month given, and no more. */
export const stopRecurringExpense = defineCommand({
  name: 'stop-recurring-expense',
  input: stopExpenseInput,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    const expense = await findExpense(db, input.expenseId);
    if (!expense) throw new RuleError('not_found');
    if (!expense.recurring) throw new RuleError('expense_not_recurring');
    if (input.stoppedOn < expense.spentOn) throw new RuleError('stop_before_start');
    await stopExpense(db, expense.expenseId, input.stoppedOn);
    return { expenseId: expense.expenseId, stoppedOn: input.stoppedOn };
  },
  summarize: (input) => `A recurring charge stopped on ${input.stoppedOn}`,
});

/** Records what the owner takes for himself: not an expense, shown apart. */
export const recordOwnerDraw = defineCommand({
  name: 'record-owner-draw',
  input: drawInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const person = personBehind(actor);
    const cashSessionId =
      input.paidFrom === 'till'
        ? await tillToPayFrom(db, { cashierId: person, siteId: input.siteId, amount: input.amount })
        : null;
    const drawId = await insertDraw(db, organizationId, {
      ...input,
      cashSessionId,
      createdBy: person,
    });
    return { drawId };
  },
  summarize: (input) => `The owner took ${input.amount}`,
});

/** Writes what an article costs to treat for a service — or a kilo: measured, or estimated. */
export const saveCostSheet = defineCommand({
  name: 'save-cost-sheet',
  input: costSheetInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const catalog = await readCatalog(db);
    const service = catalog.services.find((s) => s.serviceId === input.serviceId);
    if (!service) throw new RuleError('not_found');
    if (service.pricing === 'per_kg' && input.articleId !== null) {
      throw new RuleError('price_per_kilo_has_no_article');
    }
    if (service.pricing === 'per_piece') {
      if (!catalog.articles.some((a) => a.articleId === input.articleId)) {
        throw new RuleError('not_found');
      }
    }
    await saveSheet(db, organizationId, { ...input, updatedBy: personBehind(actor) });
    return { serviceId: input.serviceId, articleId: input.articleId };
  },
  summarize: (input) => `A cost sheet saved (${input.measured ? 'measured' : 'estimated'})`,
});
