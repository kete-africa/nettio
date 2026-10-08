import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { perform } from '@/platform/screen';
import type { BreakEven, PackMargin } from './domain/costs';
import type { StoredSheet } from './infrastructure/money.tables';
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
  type CashSession,
  type Expense,
  type OwnerDraw,
} from './money.record';

const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);

export interface ExpensesView {
  month: string;
  expenses: (Expense & { times: number })[];
  totals: { fixed: number; variable: number; total: number };
  /** Null for whoever may not read the money. */
  draws: OwnerDraw[] | null;
}

export interface CostsView {
  month: string;
  rows: {
    serviceId: string;
    serviceName: string;
    articleId: string | null;
    articleName: string | null;
    price: number;
    sheet: StoredSheet | null;
    variableCost: number | null;
    completeCost: number | null;
  }[];
  fixedCharges: number;
  laborIsVariable: boolean;
  laborMinuteCost: number;
  spread: { perMinute: number; perUnit: number; units: number; minutes: number };
}

export interface ResultView {
  month: string;
  result: { cashed: number; charges: number; result: number; draws: number; left: number; rate: number };
  fixedCharges: number;
  variableCharges: number;
  orders: number;
  units: number;
  belowCost: number;
  packs: PackMargin[];
  breakEven: BreakEven;
  reconciliation: { planned: number; real: number; gap: number; coverage: number };
  workingDays: number;
}

export const fetchSessions = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<CashSession[]>('cash_sessions', {});
  return read.ok ? read.output : null;
});

export const openTill = createServerFn({ method: 'POST' })
  .validator((input: unknown) => openSessionInput.parse(input))
  .handler(({ data }) => perform<{ sessionId: string }>('cash_open', data));

export const closeTill = createServerFn({ method: 'POST' })
  .validator((input: unknown) => closeSessionInput.parse(input))
  .handler(({ data }) =>
    perform<{ expected: number; counted: number; gap: number }>('cash_close', data),
  );

export const depositAtBank = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, deposit: bankDepositInput }).parse(input))
  .handler(({ data }) =>
    perform<{ expected: number }>('cash_deposit_at_bank', data.deposit, data.key),
  );

export const fetchExpenses = createServerFn({ method: 'GET' })
  .validator((input: unknown) => monthInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<ExpensesView>('expenses_list', data);
    return read.ok ? read.output : null;
  });

export const addExpense = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, expense: expenseInput }).parse(input))
  .handler(({ data }) => perform<{ expenseId: string }>('expenses_record', data.expense, data.key));

export const cancelExpense = createServerFn({ method: 'POST' })
  .validator((input: unknown) => voidExpenseInput.parse(input))
  .handler(({ data }) => perform<{ expenseId: string }>('expenses_void', data));

export const stopExpense = createServerFn({ method: 'POST' })
  .validator((input: unknown) => stopExpenseInput.parse(input))
  .handler(({ data }) => perform<{ expenseId: string }>('expenses_stop_recurring', data));

export const addDraw = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, draw: drawInput }).parse(input))
  .handler(({ data }) => perform<{ drawId: string }>('draws_record', data.draw, data.key));

export const fetchCosts = createServerFn({ method: 'GET' })
  .validator((input: unknown) => monthInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<CostsView>('costs_read', data);
    return read.ok ? read.output : null;
  });

export const saveSheet = createServerFn({ method: 'POST' })
  .validator((input: unknown) => costSheetInput.parse(input))
  .handler(({ data }) => perform<{ serviceId: string }>('costs_save_sheet', data));

export const fetchResult = createServerFn({ method: 'GET' })
  .validator((input: unknown) => monthInput.parse(input))
  .handler(async ({ data }) => {
    const read = await perform<ResultView>('money_result', data);
    return read.ok ? read.output : null;
  });
