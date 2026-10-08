import { defineCapability } from '@kete/capabilities';
import type { SqlExecutor } from '@kete/tenancy';
import { z } from 'zod';
import { readSettings } from '@/features/business';
import { readCatalog } from '@/features/catalog';
import { personBehind } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { holds } from '@/platform/rights';
import {
  closeCashSession,
  depositCashAtBank,
  openCashSession,
  recordExpense,
  recordOwnerDraw,
  saveCostSheet,
  stopRecurringExpense,
  voidExpenseCommand,
} from './commands';
import { chargesOf, monthPeriod, occurrences } from './domain/charges';
import {
  breakEven,
  completeCost,
  indexSheets,
  packMargins,
  periodResult,
  reconciliation,
  sheetKey,
  spreadFixed,
  variableCost,
} from './domain/costs';
import {
  asCharge,
  cashedIn,
  listDraws,
  listExpenses,
  listSessions,
  listSheets,
  periodContent,
} from './infrastructure/money.tables';
import {
  bankDepositInput,
  closeSessionInput,
  costSheetInput,
  drawInput,
  expenseInput,
  monthInput,
  openSessionInput,
  stopExpenseInput,
  voidExpenseInput,
} from './money.record';

/** The month asked for, or the current one, at Lomé's hour. */
const monthOf = (month?: string): string => month ?? new Date().toISOString().slice(0, 7);

/** Everything a month says about the money: computed here by code, never by a model. */
export async function monthFigures(db: SqlExecutor, month: string) {
  const settings = await readSettings(db);
  if (!settings) throw new RuleError('not_set_up');
  const period = monthPeriod(month);
  const expenses = await listExpenses(db, period);
  const charges = chargesOf(expenses.map(asCharge), period);
  const draws = (await listDraws(db, period)).reduce((sum, draw) => sum + draw.amount, 0);
  const cashed = await cashedIn(db, period);
  const content = await periodContent(db, period);
  const stored = await listSheets(db);
  const sheets = indexSheets(stored);
  const spread = spreadFixed(charges.fixed, content.lines, sheets);
  return {
    settings,
    period,
    expenses,
    charges,
    cashed,
    content,
    stored,
    sheets,
    spread,
    result: periodResult({
      cashed,
      fixedCharges: charges.fixed,
      variableCharges: charges.variable,
      draws,
    }),
  };
}

/**
 * What a screen, a copilot or an agent may do with the laundry's money. Reading what the laundry
 * earns is the owner's and his accountant's, and is confidential. An agent prepares an expense or
 * a cost sheet (level 3); it never opens nor closes a till, carries cash, voids nor draws alone
 * (level 4).
 */
export const moneyCapabilities = [
  defineCapability({
    name: 'cash_sessions',
    description:
      'The tills: the open ones first, then the latest closed — float, cash in, refunds, expenses, draws, bank deposits, what the till should hold, what was counted and the gap. A cashier sees her own; whoever reads the money sees all.',
    permission: 'cash:operate',
    autonomy: 1,
    input: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
    run: (input, { db, actor }) =>
      listSessions(db, {
        cashierId: holds('money:read') ? undefined : personBehind(actor),
        limit: input.limit,
      }),
  }),
  defineCapability({
    name: 'cash_open',
    description: 'Opens the person’s till at a site, with its float.',
    permission: 'cash:operate',
    autonomy: 4,
    input: openSessionInput,
    command: openCashSession,
    draft: { recordType: 'cash_opening' },
  }),
  defineCapability({
    name: 'cash_close',
    description: 'Closes a till with what was counted; the gap is kept, never corrected.',
    permission: 'cash:operate',
    autonomy: 4,
    input: closeSessionInput,
    command: closeCashSession,
    draft: { recordType: 'cash_closing' },
  }),
  defineCapability({
    name: 'cash_deposit_at_bank',
    description: 'Carries cash from a till to the bank.',
    permission: 'cash:operate',
    autonomy: 4,
    input: bankDepositInput,
    command: depositCashAtBank,
    draft: { recordType: 'bank_deposit' },
  }),
  defineCapability({
    name: 'expenses_list',
    description:
      'What went out in a month (the current one by default): each expense with how many times it counts in the month, the totals fixed and variable — and what the owner took, for whoever reads the money.',
    permission: 'expenses:read',
    autonomy: 1,
    classification: 'confidential',
    input: monthInput,
    async run(input, { db }) {
      const month = monthOf(input.month);
      const period = monthPeriod(month);
      const expenses = await listExpenses(db, period);
      return {
        month,
        expenses: expenses.map((expense) => ({
          ...expense,
          times: occurrences(asCharge(expense), period),
        })),
        totals: chargesOf(expenses.map(asCharge), period),
        draws: holds('money:read') ? await listDraws(db, period) : null,
      };
    },
  }),
  defineCapability({
    name: 'expenses_record',
    description:
      'Records something that goes out: date, label, category, fixed or variable, amount, paid from (till, mobile_money, bank, other); recurring counts every month until stopped.',
    permission: 'expenses:write',
    autonomy: 3,
    input: expenseInput,
    command: recordExpense,
    draft: { recordType: 'expense' },
  }),
  defineCapability({
    name: 'expenses_void',
    description: 'Voids an expense recorded by mistake, with a reason: it stays, marked.',
    permission: 'expenses:write',
    autonomy: 4,
    input: voidExpenseInput,
    command: voidExpenseCommand,
    draft: { recordType: 'expense_void' },
  }),
  defineCapability({
    name: 'expenses_stop_recurring',
    description: 'Stops a recurring charge: it counts until the month given, and no more.',
    permission: 'expenses:write',
    autonomy: 3,
    input: stopExpenseInput,
    command: stopRecurringExpense,
    draft: { recordType: 'expense_stop' },
  }),
  defineCapability({
    name: 'draws_record',
    description: 'Records what the owner takes for himself: not an expense, shown apart.',
    permission: 'draws:record',
    autonomy: 4,
    input: drawInput,
    command: recordOwnerDraw,
    draft: { recordType: 'owner_draw' },
  }),
  defineCapability({
    name: 'costs_read',
    description:
      'The cost sheets: for each article and service (or kilo) on sale, its minutes of work, consumables, machine, whether measured or estimated, its variable cost and — with the fixed charges of the month spread over the month’s volume — its complete cost. A couple with no sheet is « never measured ».',
    permission: 'money:read',
    autonomy: 1,
    classification: 'confidential',
    input: monthInput,
    async run(input, { db }) {
      const figures = await monthFigures(db, monthOf(input.month));
      const catalog = await readCatalog(db);
      const articles = new Map(catalog.articles.map((a) => [a.articleId, a.name]));
      const rows = catalog.prices
        .map((price) => {
          const service = catalog.services.find((s) => s.serviceId === price.serviceId);
          const sheet = figures.stored.find(
            (s) => sheetKey(s.serviceId, s.articleId) === sheetKey(price.serviceId, price.articleId),
          );
          return {
            serviceId: price.serviceId,
            serviceName: service?.name ?? '',
            articleId: price.articleId,
            articleName: price.articleId ? (articles.get(price.articleId) ?? '') : null,
            price: price.amount,
            sheet: sheet ?? null,
            variableCost: sheet ? variableCost(sheet, figures.settings) : null,
            completeCost: sheet ? completeCost(sheet, figures.settings, figures.spread) : null,
          };
        })
        .sort(
          (a, b) =>
            a.serviceName.localeCompare(b.serviceName) ||
            (a.articleName ?? '').localeCompare(b.articleName ?? ''),
        );
      return {
        month: monthOf(input.month),
        rows,
        fixedCharges: figures.charges.fixed,
        laborIsVariable: figures.settings.laborIsVariable,
        laborMinuteCost: figures.settings.laborMinuteCost,
        /** How the fixed charges are spread this month: per minute of work, or per unit. */
        spread: figures.spread,
      };
    },
  }),
  defineCapability({
    name: 'costs_save_sheet',
    description:
      'Writes what an article costs to treat for a service (or a kilo): minutes of work, consumables, machine — measured at the laundry, or estimated. Never invent a measure.',
    permission: 'costs:manage',
    autonomy: 3,
    input: costSheetInput,
    command: saveCostSheet,
    draft: { recordType: 'cost_sheet' },
  }),
  defineCapability({
    name: 'money_result',
    description:
      'Whether the laundry earns, for a month (the current one by default): cashed (payments minus refunds), charges fixed and variable, the result, what the owner took and what is left; what each pack really earns on its real content; break-even; planned against real variable costs. Every figure is computed by code; a missing measure is said, never estimated.',
    permission: 'money:read',
    autonomy: 1,
    classification: 'confidential',
    input: monthInput,
    async run(input, { db }) {
      const month = monthOf(input.month);
      const figures = await monthFigures(db, month);
      const { settings, content, sheets, spread, charges, cashed } = figures;
      return {
        month,
        result: figures.result,
        fixedCharges: charges.fixed,
        variableCharges: charges.variable,
        orders: content.orders,
        units: content.lines.reduce((sum, line) => sum + line.quantity, 0),
        /** Deposits of the month sold under the variable cost of their content. */
        belowCost: content.belowCost,
        packs: packMargins(content.packSales, sheets, settings, spread),
        breakEven: breakEven({
          cashed,
          fixedCharges: charges.fixed,
          workingDays: settings.workingDays,
          lines: content.lines,
          sheets,
          settings,
        }),
        reconciliation: reconciliation({
          lines: content.lines,
          sheets,
          settings,
          variableCharges: charges.variable,
        }),
        workingDays: settings.workingDays,
      };
    },
  }),
];
