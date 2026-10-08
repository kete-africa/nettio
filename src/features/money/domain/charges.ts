// Everything that goes out (docs/product/model.md, « Dépenses et charges »), pure: what counts
// in a period, fixed and variable. A recurring charge counts every month from the month it starts
// until the month it is stopped; a voided expense counts nowhere.

export const expenseCategories = [
  'rent',
  'wages',
  'electricity',
  'water',
  'detergent',
  'packaging',
  'maintenance',
  'depreciation',
  'transport',
  'telecom',
  'taxes',
  'other',
] as const;
export type ExpenseCategory = (typeof expenseCategories)[number];

export type Behavior = 'fixed' | 'variable';

/** How a category usually behaves (docs/product/referentiels.md); the laundry may say otherwise. */
export const usualBehavior: Record<ExpenseCategory, Behavior> = {
  rent: 'fixed',
  wages: 'fixed',
  electricity: 'variable',
  water: 'variable',
  detergent: 'variable',
  packaging: 'variable',
  maintenance: 'fixed',
  depreciation: 'fixed',
  transport: 'variable',
  telecom: 'fixed',
  taxes: 'fixed',
  other: 'variable',
};

export interface Charge {
  /** YYYY-MM-DD. */
  spentOn: string;
  amount: number;
  behavior: Behavior;
  recurring: boolean;
  /** YYYY-MM-DD: the last month it counts in; null while it runs. */
  stoppedOn: string | null;
  voided: boolean;
}

/** A month as a number of months since year 0: months compare and subtract. */
const monthIndex = (day: string): number => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;

/** The months of a period: from the month of `from` to the month of the day before `to`. */
export function monthsOf(period: { from: string; to: string }): number[] {
  const first = monthIndex(period.from);
  const end = new Date(`${period.to}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - 1);
  const last = monthIndex(end.toISOString().slice(0, 10));
  return Array.from({ length: Math.max(0, last - first + 1) }, (_unused, index) => first + index);
}

/**
 * How many times a charge counts in a period (`from` included, `to` excluded): once if it is a
 * one-off expense of the period, once per month it runs in for a recurring one.
 */
export function occurrences(charge: Charge, period: { from: string; to: string }): number {
  if (charge.voided) return 0;
  if (!charge.recurring) return charge.spentOn >= period.from && charge.spentOn < period.to ? 1 : 0;
  const start = monthIndex(charge.spentOn);
  const stop = charge.stoppedOn ? monthIndex(charge.stoppedOn) : Number.POSITIVE_INFINITY;
  return monthsOf(period).filter((month) => month >= start && month <= stop).length;
}

/** The charges of a period, fixed and variable. */
export function chargesOf(
  charges: Charge[],
  period: { from: string; to: string },
): { fixed: number; variable: number; total: number } {
  let fixed = 0;
  let variable = 0;
  for (const charge of charges) {
    const amount = charge.amount * occurrences(charge, period);
    if (charge.behavior === 'fixed') fixed += amount;
    else variable += amount;
  }
  return { fixed, variable, total: fixed + variable };
}

/** A month as a period: « 2026-10 » → from its first day to the first day of the next month. */
export function monthPeriod(month: string): { from: string; to: string } {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7));
  const next = index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, '0')}`;
  return { from: `${month}-01`, to: `${next}-01` };
}
