import * as m from '@/paraglide/messages.js';
import type { ApprovalKind, ComplaintKind } from '../domain/manager';

export const approvalWords: Record<ApprovalKind, () => string> = {
  discount: m.approval_kind_discount,
  cancel: m.approval_kind_cancel,
  refund: m.approval_kind_refund,
};

export const complaintWords: Record<ComplaintKind, () => string> = {
  damage: m.complaint_kind_damage,
  loss: m.complaint_kind_loss,
  stain: m.complaint_kind_stain,
  delay: m.complaint_kind_delay,
  other: m.complaint_kind_other,
};

export const weekdayWords: (() => string)[] = [
  m.weekday_monday,
  m.weekday_tuesday,
  m.weekday_wednesday,
  m.weekday_thursday,
  m.weekday_friday,
  m.weekday_saturday,
  m.weekday_sunday,
];

/** 450 → « 07:30 ». */
export const clock = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

/** « 07:30 » → 450; null when it is not a time. */
export function minuteOf(text: string): number | null {
  const found = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!found) return null;
  const minute = Number(found[1]) * 60 + Number(found[2]);
  return Number(found[2]) < 60 && minute <= 1440 ? minute : null;
}
