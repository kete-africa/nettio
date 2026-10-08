import { z } from 'zod';
import { expenseCategories, type Behavior, type ExpenseCategory } from './domain/charges';

// The money of the laundry beyond its deposits (docs/product/model.md, « L'argent », « Les
// coûts »): the till, everything that goes out, what the owner takes, and what things cost.

const id = z.string().min(1).max(64);
const amount = z.number().int().min(0).max(1_000_000_000);
const day = z.iso.date();
const cost = z.number().min(0).max(10_000_000);

export const paidFroms = ['till', 'mobile_money', 'bank', 'other'] as const;
export type PaidFrom = (typeof paidFroms)[number];

export const openSessionInput = z.object({
  siteId: id,
  /** What is in the till when it opens. */
  openingFloat: amount,
});

export const closeSessionInput = z.object({
  sessionId: id,
  /** What the cashier counted. */
  counted: amount,
  note: z.string().trim().max(300).default(''),
});

export const bankDepositInput = z.object({
  sessionId: id,
  amount: amount.min(1),
  note: z.string().trim().max(300).default(''),
});

export const expenseInput = z.object({
  spentOn: day,
  label: z.string().trim().min(1).max(160),
  category: z.enum(expenseCategories),
  behavior: z.enum(['fixed', 'variable']),
  amount: amount.min(1),
  paidFrom: z.enum(paidFroms),
  /** The site it belongs to; none for the whole laundry. */
  siteId: id.nullable().default(null),
  /** Counts every month from its date until it is stopped: rent, wages. */
  recurring: z.boolean().default(false),
  /** Who it was handed to, for wages: an advance, a pay (the user id of a person of the team). */
  paidTo: id.nullable().default(null),
});

export const voidExpenseInput = z.object({
  expenseId: id,
  reason: z.string().trim().min(1).max(300),
});

export const stopExpenseInput = z.object({
  expenseId: id,
  /** The last month it counts in. */
  stoppedOn: day,
});

export const drawInput = z.object({
  drawnOn: day,
  amount: amount.min(1),
  paidFrom: z.enum(paidFroms),
  siteId: id.nullable().default(null),
  note: z.string().trim().max(300).default(''),
});

export const costSheetInput = z.object({
  serviceId: id,
  /** Null for a per-kilo service: the sheet of one kilo. */
  articleId: id.nullable(),
  laborMinutes: z.number().min(0).max(1440),
  consumablesCost: cost,
  machineCost: cost,
  /** Measured at the laundry (weighed, timed), or only estimated. */
  measured: z.boolean(),
});

export const monthInput = z.object({
  /** YYYY-MM; the current month when absent. */
  month: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export interface CashSession {
  sessionId: string;
  siteId: string;
  cashierId: string;
  cashierName: string;
  openedAt: Date;
  closedAt: Date | null;
  openingFloat: number;
  cashIn: number;
  cashRefunds: number;
  expenses: number;
  draws: number;
  bankDeposits: number;
  /** What it should hold: now for an open till, at its closing for a closed one. */
  expected: number;
  counted: number | null;
  gap: number | null;
  note: string;
}

export interface Expense {
  expenseId: string;
  spentOn: string;
  label: string;
  category: ExpenseCategory;
  behavior: Behavior;
  amount: number;
  paidFrom: PaidFrom;
  siteId: string | null;
  recurring: boolean;
  stoppedOn: string | null;
  voided: boolean;
  voidReason: string;
  /** Who it was handed to, for wages. */
  paidTo: string | null;
}

export interface OwnerDraw {
  drawId: string;
  drawnOn: string;
  amount: number;
  paidFrom: PaidFrom;
  note: string;
}
