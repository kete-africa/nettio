import { RuleError } from '@/lib/rule-error';

// What lets a site run without its owner (specs/025-manager): who is expected and when, what a
// clerk may only ask for, a complaint and its outcome, deposits nobody comes back for, and a
// personal code on a shared device. Pure rules; nothing here reads a clock or a database.

/** A person's usual hours on a weekday (0 = Monday … 6 = Sunday), in minutes from midnight. */
export interface Shift {
  userId: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

/** Monday = 0 … Sunday = 6, in universal time (the time of Lomé). */
export const weekdayOf = (date: Date): number => (date.getUTCDay() + 6) % 7;

export function checkShift(shift: { startMinute: number; endMinute: number }): void {
  const whole = Number.isInteger(shift.startMinute) && Number.isInteger(shift.endMinute);
  if (!whole || shift.startMinute < 0 || shift.endMinute > 1440 || shift.endMinute <= shift.startMinute) {
    throw new RuleError('shift_invalid');
  }
}

/** The hours a person is expected on a day; null on a day off. */
export function expectedOn(shifts: Shift[], userId: string, date: Date): { startMinute: number; endMinute: number } | null {
  const shift = shifts.find((s) => s.userId === userId && s.weekday === weekdayOf(date));
  return shift ? { startMinute: shift.startMinute, endMinute: shift.endMinute } : null;
}

/**
 * How late a person is: expected, her hour passed, and not clocked in yet today. Null when she is
 * not late — not expected, not yet due, or she came (whenever she came).
 */
export function latenessOf(input: {
  expected: { startMinute: number; endMinute: number } | null;
  cameToday: boolean;
  now: Date;
}): number | null {
  if (!input.expected || input.cameToday) return null;
  const minute = input.now.getUTCHours() * 60 + input.now.getUTCMinutes();
  if (minute <= input.expected.startMinute || minute >= input.expected.endMinute) return null;
  return minute - input.expected.startMinute;
}

export const approvalKinds = ['discount', 'cancel', 'refund'] as const;
export type ApprovalKind = (typeof approvalKinds)[number];

/** What a clerk may only ask for: checked when asked, and again when it is granted. */
export function checkRequest(
  request: { kind: ApprovalKind; amount: number; reason: string },
  order: { status: string; total: number; paid: number; discount: number },
): void {
  if (request.reason.trim() === '') throw new RuleError('reason_needed');
  if (order.status === 'cancelled') throw new RuleError('order_cancelled');
  if (request.kind === 'cancel') {
    if (order.status === 'collected') throw new RuleError('order_not_open');
    return;
  }
  if (!Number.isInteger(request.amount) || request.amount <= 0) throw new RuleError('amount_invalid');
  if (request.kind === 'refund' && request.amount > order.paid) throw new RuleError('refund_above_paid');
  if (request.kind === 'discount') {
    if (order.status === 'collected') throw new RuleError('order_not_open');
    // The deposit's price before any discount; a discount never makes it negative, nor less than paid.
    const before = order.total + order.discount;
    if (request.amount > before) throw new RuleError('amount_invalid');
    if (order.paid > before - request.amount) throw new RuleError('refund_first');
  }
}

export const complaintKinds = ['damage', 'loss', 'stain', 'delay', 'other'] as const;
export type ComplaintKind = (typeof complaintKinds)[number];

/** The laundry's rules for deposits that sleep: its own decision — zero means no fee. */
export interface StorageRules {
  freeDays: number;
  feePerDay: number;
  abandonDays: number;
}

const DAY = 86_400_000;
export const daysSince = (from: Date, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - from.getTime()) / DAY));

/** What a ready deposit owes for staying: the days beyond the free ones, minus what was charged. */
export function storageFee(input: { readyAt: Date; now: Date; rules: StorageRules; alreadyCharged: number }): {
  days: number;
  billableDays: number;
  due: number;
} {
  const days = daysSince(input.readyAt, input.now);
  const billableDays = Math.max(0, days - input.rules.freeDays);
  return { days, billableDays, due: Math.max(0, billableDays * input.rules.feePerDay - input.alreadyCharged) };
}

/** A deposit leaves the laundry only after its customer was warned, and the delay ran out. */
export function mayRelease(input: { noticedAt: Date | null; now: Date; rules: StorageRules }): boolean {
  return input.noticedAt !== null && daysSince(input.noticedAt, input.now) >= input.rules.abandonDays;
}

/** A personal code: six digits, not six times the same, not a simple run. */
export function checkCode(code: string): void {
  if (!/^\d{6}$/.test(code)) throw new RuleError('code_invalid');
  if (/^(\d)\1{5}$/.test(code) || '0123456789012345'.includes(code) || '9876543210987654'.includes(code)) {
    throw new RuleError('code_too_simple');
  }
}

export const MAX_FAILURES = 5;
export const LOCK_MINUTES = 15;
