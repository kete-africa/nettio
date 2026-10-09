import { defineCapability } from '@kete/capabilities';
import { listStaff } from '@/features/business/infrastructure/business.tables';
import { dayBounds } from '@/features/orders';
import { periodsWithin } from '@/features/team/infrastructure/presence.tables';
import { personBehind } from '@/lib/actor';
import { holds } from '@/platform/rights';
import {
  chargeStorageFee,
  closeComplaint,
  decideOnApproval,
  openComplaint,
  releaseUnclaimed,
  requestApproval,
  setRules,
  setWeek,
  warnBeforeRelease,
} from './commands';
import { expectedOn, latenessOf, mayRelease, storageFee, type Shift } from './domain/manager';
import {
  listApprovals,
  listComplaints,
  listShifts,
  readRules,
  sleepingDeposits,
  type Approval,
  type Complaint,
  type ManagerRules,
} from './infrastructure/manager.tables';
import {
  complaintInput,
  decideInput,
  noInput,
  orderInput,
  releaseInput,
  requestInput,
  resolveComplaintInput,
  rulesInput,
  weekInput,
} from './manager.record';

export interface ScheduleView {
  people: {
    userId: string;
    name: string;
    week: Shift[];
    /** Her hours today; null on a day off. */
    expected: { startMinute: number; endMinute: number } | null;
    /** Minutes late now; null when she is not. */
    late: number | null;
  }[];
}

/** A request, with the name of who asked. */
export type AskedApproval = Approval & { requestedByName: string };

export interface UnclaimedView {
  rules: ManagerRules;
  deposits: {
    orderId: string;
    number: string;
    customerName: string;
    days: number;
    /** The storage fee not charged yet, by the laundry's rules. */
    feeDue: number;
    charged: number;
    balance: number;
    noticedAt: Date | null;
    mayRelease: boolean;
    invoiced: boolean;
  }[];
}

/**
 * What a screen, a copilot or an agent may do for a manager. Reading is level 1. Every gesture
 * commits the laundry or its money: an agent only prepares it; a decision that moves money asks
 * the person once more (level 4).
 */
export const managerCapabilities = [
  defineCapability({
    name: 'schedule_read',
    description:
      'The usual week of each person of the team (hours per weekday, 0 = Monday), who is expected today, and who is late now: expected, her hour passed, not clocked in.',
    permission: 'presence:read',
    autonomy: 1,
    input: noInput,
    async run(_input, { db }): Promise<ScheduleView> {
      const now = new Date();
      const shifts = await listShifts(db);
      const today = await periodsWithin(db, dayBounds());
      return {
        people: (await listStaff(db))
          .filter((member) => member.active && member.role)
          .map((member) => {
            const expected = expectedOn(shifts, member.userId, now);
            return {
              userId: member.userId,
              name: member.name,
              week: shifts.filter((shift) => shift.userId === member.userId),
              expected,
              late: latenessOf({
                expected,
                cameToday: today.some((period) => period.userId === member.userId),
                now,
              }),
            };
          }),
      };
    },
  }),
  defineCapability({
    name: 'schedule_set_week',
    description:
      'Sets a person’s usual week: her hours for each working day (minutes from midnight); the days left out are days off.',
    permission: 'schedule:manage',
    autonomy: 3,
    input: weekInput,
    command: setWeek,
    draft: { recordType: 'week' },
  }),
  defineCapability({
    name: 'approvals_list',
    description:
      'The requests for a manager’s approval — a discount, a cancellation, a refund on a deposit — with who asked and why. A manager reads them all; anyone else, her own.',
    permission: 'approvals:request',
    autonomy: 1,
    classification: 'confidential',
    input: noInput,
    async run(_input, { db, actor }): Promise<{ approvals: AskedApproval[]; mayDecide: boolean }> {
      const mayDecide = holds('approvals:decide');
      const names = new Map((await listStaff(db)).map((member) => [member.userId, member.name]));
      const approvals = await listApprovals(db, {
        pendingOnly: false,
        requestedBy: mayDecide ? undefined : personBehind(actor),
      });
      return {
        mayDecide,
        approvals: approvals.map((approval) => ({
          ...approval,
          requestedByName: names.get(approval.requestedBy) ?? '',
        })),
      };
    },
  }),
  defineCapability({
    name: 'approvals_request',
    description:
      'Asks a manager for what the person may not do alone: a discount on a deposit (amount), its cancellation, or a refund (amount, method) — with the reason. Nothing changes until a manager decides.',
    permission: 'approvals:request',
    autonomy: 3,
    input: requestInput,
    command: requestApproval,
    draft: { recordType: 'approval_request' },
  }),
  defineCapability({
    name: 'approvals_decide',
    description:
      'Grants or refuses a request. Granted, the discount, the cancellation or the refund is done at once under the deposit’s own rules.',
    permission: 'approvals:decide',
    autonomy: 4,
    input: decideInput,
    command: decideOnApproval,
    draft: { recordType: 'approval_decision' },
  }),
  defineCapability({
    name: 'complaints_list',
    description:
      'The complaints of customers on their deposits — damage, loss, stain, delay — open or resolved, with what was decided and what the laundry gave.',
    permission: 'complaints:open',
    autonomy: 1,
    classification: 'confidential',
    input: orderInput.partial(),
    async run(input, { db }): Promise<{ complaints: Complaint[] }> {
      return { complaints: await listComplaints(db, { openOnly: false, orderId: input.orderId }) };
    },
  }),
  defineCapability({
    name: 'complaints_open',
    description: 'Opens a complaint on a deposit: its kind and what the customer says.',
    permission: 'complaints:open',
    autonomy: 3,
    input: complaintInput,
    command: openComplaint,
    draft: { recordType: 'complaint' },
  }),
  defineCapability({
    name: 'complaints_close',
    description:
      'Closes a complaint with what was decided and what the laundry gives (F CFA, 0 for none). The money itself is given by a refund on the deposit or recorded as an expense.',
    permission: 'complaints:resolve',
    autonomy: 3,
    input: resolveComplaintInput,
    command: closeComplaint,
    draft: { recordType: 'complaint_outcome' },
  }),
  defineCapability({
    name: 'unclaimed_list',
    description:
      'The ready deposits nobody came back for, the oldest first: days since ready, the storage fee due by the laundry’s rules, whether its customer was warned, whether it may leave the laundry — and those rules.',
    permission: 'unclaimed:manage',
    autonomy: 1,
    classification: 'confidential',
    input: noInput,
    async run(_input, { db }): Promise<UnclaimedView> {
      const rules = await readRules(db);
      const now = new Date();
      return {
        rules,
        deposits: (await sleepingDeposits(db))
          .map((deposit) => {
            const fee = storageFee({ readyAt: deposit.readyAt, now, rules, alreadyCharged: deposit.charged });
            return {
              orderId: deposit.orderId,
              number: deposit.number,
              customerName: deposit.customerName,
              days: fee.days,
              feeDue: fee.due,
              charged: deposit.charged,
              balance: deposit.total - deposit.paid,
              noticedAt: deposit.noticedAt,
              mayRelease: mayRelease({ noticedAt: deposit.noticedAt, now, rules }),
              invoiced: deposit.invoiced,
            };
          })
          // Only what sleeps beyond the free days, or was already warned.
          .filter((deposit) => deposit.days > rules.freeDays || deposit.noticedAt !== null),
      };
    },
  }),
  defineCapability({
    name: 'unclaimed_set_rules',
    description:
      'Sets the laundry’s own rules: free days of storage, fee per day after them (0: none), days between the warning and the release of an unclaimed deposit, and whether a shared device may switch person with a personal code.',
    permission: 'settings:manage',
    autonomy: 3,
    input: rulesInput,
    command: setRules,
    draft: { recordType: 'manager_rules' },
  }),
  defineCapability({
    name: 'unclaimed_charge',
    description: 'Charges the storage fee a sleeping deposit owes, by the laundry’s rules: its price grows by it.',
    permission: 'unclaimed:manage',
    autonomy: 3,
    input: orderInput,
    command: chargeStorageFee,
    draft: { recordType: 'storage_fee' },
  }),
  defineCapability({
    name: 'unclaimed_warn',
    description:
      'Warns a customer, once, that her unclaimed deposit will leave the laundry after the laundry’s delay; the date is kept.',
    permission: 'unclaimed:manage',
    autonomy: 3,
    input: orderInput,
    command: warnBeforeRelease,
    draft: { recordType: 'abandon_notice' },
  }),
  defineCapability({
    name: 'unclaimed_release',
    description:
      'Takes an unclaimed deposit out of the laundry — given, sold, thrown away — only after its warning and the delay. It cannot be undone.',
    permission: 'unclaimed:manage',
    autonomy: 4,
    input: releaseInput,
    command: releaseUnclaimed,
    draft: { recordType: 'release' },
  }),
];
