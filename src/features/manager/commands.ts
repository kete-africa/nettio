import { defineCommand } from '@kete/commands';
import { findStaffOf } from '@/features/business';
import { askDelivery } from '@/platform/channels';
import { queueOrderMessage } from '@/features/messaging/infrastructure/outbox';
import { cancelOrder, refundPayment } from '@/features/orders/commands';
import { noteEvent } from '@/features/orders/infrastructure/orders.tables';
import { personBehind, signer } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { checkRequest, checkShift, mayRelease, storageFee } from './domain/manager';
import {
  chargeStorage,
  decideApproval,
  grantDiscount,
  insertApproval,
  insertComplaint,
  lockApproval,
  noteNotice,
  orderForApproval,
  readRules,
  releaseDeposit,
  resolveComplaint,
  saveRules,
  saveWeek,
  sleepingDeposits,
} from './infrastructure/manager.tables';
import {
  complaintInput,
  decideInput,
  orderInput,
  releaseInput,
  requestInput,
  resolveComplaintInput,
  rulesInput,
  weekInput,
} from './manager.record';

/** A person's usual week: the days given are her hours, the others are days off. */
export const setWeek = defineCommand({
  name: 'set-week',
  input: weekInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (!(await findStaffOf(db, input.userId))) throw new RuleError('not_found');
    if (new Set(input.days.map((day) => day.weekday)).size !== input.days.length) throw new RuleError('shift_invalid');
    for (const day of input.days) checkShift(day);
    await saveWeek(db, organizationId, input.userId, input.days);
    return { userId: input.userId, days: input.days.length };
  },
  summarize: (_input, output) => `Week set: ${output.days} working day(s)`,
});

/**
 * What a clerk may not do alone, she asks for: a discount on a deposit, its cancellation, a
 * refund. Nothing changes until a manager decides.
 */
export const requestApproval = defineCommand({
  name: 'request-approval',
  input: requestInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await orderForApproval(db, input.orderId);
    if (!order) throw new RuleError('not_found');
    checkRequest(input, order);
    if (input.kind === 'refund' && !input.method) throw new RuleError('invalid_input');
    const approvalId = await insertApproval(db, organizationId, {
      kind: input.kind,
      orderId: input.orderId,
      amount: input.kind === 'cancel' ? 0 : input.amount,
      method: input.method ?? '',
      reason: input.reason,
      requestedBy: personBehind(actor),
    });
    // Those who decide are told on their own WhatsApp or Telegram, when they tied one.
    askDelivery(organizationId);
    return { approvalId, number: order.number };
  },
  summarize: (input, output) => `Approval asked: ${input.kind} on ${output.number}`,
});

/**
 * A manager decides. Granted, the gesture is done at once, in her name and under the deposit's
 * own rules — which are checked again: the deposit may have changed since it was asked.
 */
export const decideOnApproval = defineCommand({
  name: 'decide-approval',
  input: decideInput,
  reversibility: { reversible: false },
  async handler(input, context) {
    const { db, organizationId, actor } = context;
    const approval = await lockApproval(db, input.approvalId);
    if (!approval) throw new RuleError('not_found');
    if (approval.status !== 'pending') throw new RuleError('already_decided');
    if (input.approve) {
      if (approval.kind === 'cancel') {
        await cancelOrder.handler({ orderId: approval.orderId, reason: approval.reason }, context);
      } else if (approval.kind === 'refund') {
        await refundPayment.handler(
          {
            orderId: approval.orderId,
            amount: approval.amount,
            method: approval.method as 'cash',
            reason: approval.reason,
          },
          context,
        );
      } else {
        const order = await orderForApproval(db, approval.orderId);
        if (!order) throw new RuleError('not_found');
        checkRequest({ kind: 'discount', amount: approval.amount, reason: approval.reason }, order);
        await grantDiscount(db, approval.orderId, approval.amount, approval.reason);
        await noteEvent(db, organizationId, {
          orderId: approval.orderId,
          kind: 'discount',
          detail: { amount: approval.amount, reason: approval.reason, askedBy: approval.requestedBy },
          actor: signer(actor),
        });
      }
    }
    await decideApproval(db, approval.approvalId, {
      status: input.approve ? 'approved' : 'refused',
      decidedBy: personBehind(actor),
      note: input.note,
    });
    return { approvalId: approval.approvalId, kind: approval.kind, number: approval.orderNumber, approved: input.approve };
  },
  summarize: (_input, output) =>
    `${output.kind} on ${output.number} ${output.approved ? 'granted' : 'refused'}`,
});

/** A customer complains: a file is opened on her deposit. */
export const openComplaint = defineCommand({
  name: 'open-complaint',
  input: complaintInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await orderForApproval(db, input.orderId);
    if (!order) throw new RuleError('not_found');
    const complaintId = await insertComplaint(db, organizationId, { ...input, createdBy: personBehind(actor) });
    await noteEvent(db, organizationId, {
      orderId: input.orderId,
      kind: 'complaint',
      detail: { kind: input.kind },
      actor: signer(actor),
    });
    return { complaintId, number: order.number };
  },
  summarize: (_input, output) => `Complaint opened on ${output.number}`,
});

/** A complaint is closed with what was decided, and what the laundry gives. */
export const closeComplaint = defineCommand({
  name: 'close-complaint',
  input: resolveComplaintInput,
  reversibility: { reversible: false },
  async handler(input, { db, actor }) {
    const closed = await resolveComplaint(db, input.complaintId, {
      resolution: input.resolution,
      compensation: input.compensation,
      resolvedBy: personBehind(actor),
    });
    if (!closed) throw new RuleError('not_found');
    return { complaintId: input.complaintId, compensation: input.compensation };
  },
  summarize: (_input, output) => `Complaint closed, compensation ${output.compensation}`,
});

/** The laundry's own rules: storage fee (0: none), the delay before a deposit may leave, the shared device. */
export const setRules = defineCommand({
  name: 'set-manager-rules',
  input: rulesInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    await saveRules(db, organizationId, input);
    return input;
  },
  summarize: (input) => `Rules set: ${input.feePerDay} per day after ${input.freeDays} days`,
});

/** Charges what a sleeping deposit owes for staying, by the laundry's rules. */
export const chargeStorageFee = defineCommand({
  name: 'charge-storage-fee',
  input: orderInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const [deposit] = await sleepingDeposits(db, input.orderId);
    if (!deposit) throw new RuleError('order_not_ready');
    // An invoice is written once: a deposit already billed is not charged behind its back.
    if (deposit.invoiced) throw new RuleError('already_invoiced');
    const fee = storageFee({
      readyAt: deposit.readyAt,
      now: new Date(),
      rules: await readRules(db),
      alreadyCharged: deposit.charged,
    });
    if (fee.due <= 0) throw new RuleError('no_storage_fee');
    await chargeStorage(db, organizationId, {
      orderId: input.orderId,
      days: fee.billableDays,
      amount: fee.due,
      appliedBy: personBehind(actor),
    });
    await noteEvent(db, organizationId, {
      orderId: input.orderId,
      kind: 'storage_fee',
      detail: { amount: fee.due, days: fee.billableDays },
      actor: signer(actor),
    });
    return { number: deposit.number, amount: fee.due, days: fee.billableDays };
  },
  summarize: (_input, output) => `Storage fee on ${output.number}: ${output.amount}`,
});

/**
 * Warns the customer that her deposit will leave the laundry: the date is kept, and a reminder
 * goes out when the laundry turned its reminders on. Once.
 */
export const warnBeforeRelease = defineCommand({
  name: 'warn-before-release',
  input: orderInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const [deposit] = await sleepingDeposits(db, input.orderId);
    if (!deposit) throw new RuleError('order_not_ready');
    if (!(await noteNotice(db, organizationId, { orderId: input.orderId, noticedBy: personBehind(actor) }))) {
      throw new RuleError('already_noticed');
    }
    const sent = await queueOrderMessage(db, organizationId, { orderId: input.orderId, kind: 'reminder' });
    if (sent) askDelivery(organizationId);
    await noteEvent(db, organizationId, {
      orderId: input.orderId,
      kind: 'abandon_notice',
      detail: { message: sent },
      actor: signer(actor),
    });
    return { number: deposit.number, messageQueued: sent };
  },
  summarize: (_input, output) => `Notice before release on ${output.number}`,
});

/** The deposit leaves the laundry: only after its notice, and the laundry's delay. */
export const releaseUnclaimed = defineCommand({
  name: 'release-unclaimed',
  input: releaseInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const [deposit] = await sleepingDeposits(db, input.orderId);
    if (!deposit) throw new RuleError('order_not_ready');
    if (!mayRelease({ noticedAt: deposit.noticedAt, now: new Date(), rules: await readRules(db) })) {
      throw new RuleError('release_too_early');
    }
    // An invoice is written once: what it still claims is cancelled by a credit note first.
    if (deposit.invoiced && deposit.total > deposit.paid) throw new RuleError('already_invoiced');
    await releaseDeposit(db, {
      orderId: input.orderId,
      destination: input.destination,
      releasedBy: personBehind(actor),
    });
    await noteEvent(db, organizationId, {
      orderId: input.orderId,
      kind: 'released',
      detail: { destination: input.destination, kept: deposit.paid, givenUp: deposit.total - deposit.paid },
      actor: signer(actor),
    });
    return { number: deposit.number, givenUp: deposit.total - deposit.paid };
  },
  summarize: (_input, output) => `Unclaimed deposit ${output.number} released`,
});
