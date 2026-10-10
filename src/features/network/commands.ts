import { defineCommand } from '@kete/commands';
import { listSites, receives } from '@/features/business';
import { noteEvent } from '@/features/orders/infrastructure/orders.tables';
import { personBehind, signer } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { checkTransfer, receptionOf, transferNumber } from './domain/network';
import {
  findTransfer,
  insertTransfer,
  lockPlaced,
  markReceived,
  removePartner,
  saveAllocation,
  savePartner,
} from './infrastructure/network.tables';
import { allocationInput, partnerInput, receiveInput, sendInput, siteRef } from './network.record';

/** Deposits leave a site for another, with their slip. Each is at the site it leaves from. */
export const sendTransfer = defineCommand({
  name: 'send-transfer',
  input: sendInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const sites = await listSites(db);
    const from = sites.find((site) => site.siteId === input.fromSiteId && site.active);
    const to = sites.find((site) => site.siteId === input.toSiteId && site.active);
    if (!from || !to) throw new RuleError('not_found');
    const orderIds = [...new Set(input.orderIds)];
    const orders = await lockPlaced(db, orderIds);
    if (orders.length !== orderIds.length) throw new RuleError('not_found');
    checkTransfer({ fromSiteId: from.siteId, toSiteId: to.siteId, orders });
    const transfer = await insertTransfer(db, organizationId, {
      numberOf: transferNumber,
      fromSiteId: from.siteId,
      toSiteId: to.siteId,
      note: input.note,
      sentBy: personBehind(actor),
      orderIds,
    });
    for (const order of orders) {
      await noteEvent(db, organizationId, {
        orderId: order.orderId,
        kind: 'transfer_sent',
        detail: { transfer: transfer.number, to: to.name },
        actor: signer(actor),
      });
    }
    return { ...transfer, from: from.name, to: to.name, deposits: orders.length };
  },
  summarize: (_input, output) => `Transfer ${output.number}: ${output.deposits} deposit(s) to ${output.to}`,
});

/**
 * The slip is checked on arrival: what is there is now at this site, what is not is said missing —
 * on the slip and in the deposit's history. Received once.
 */
export const receiveTransfer = defineCommand({
  name: 'receive-transfer',
  input: receiveInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const transfer = await findTransfer(db, input.transferId, true);
    if (!transfer) throw new RuleError('not_found');
    if (transfer.status !== 'sent') throw new RuleError('transfer_already_received');
    const { received, missing } = receptionOf(
      transfer.lines.map((line) => line.orderId),
      [...new Set(input.receivedOrderIds)],
    );
    await markReceived(db, transfer.transferId, {
      orderIds: received,
      receivedBy: personBehind(actor),
      note: input.note,
    });
    for (const line of transfer.lines) {
      await noteEvent(db, organizationId, {
        orderId: line.orderId,
        kind: received.includes(line.orderId) ? 'transfer_received' : 'transfer_missing',
        detail: { transfer: transfer.number, at: transfer.toName },
        actor: signer(actor),
      });
    }
    return { number: transfer.number, received: received.length, missing: missing.length };
  },
  summarize: (_input, output) =>
    `Transfer ${output.number} received: ${output.received} there, ${output.missing} missing`,
});

/** A counter run by a partner, and the commission the laundry gives it: its own decision. */
export const setPartner = defineCommand({
  name: 'set-partner-point',
  input: partnerInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const site = (await listSites(db)).find((each) => each.siteId === input.siteId);
    if (!site) throw new RuleError('not_found');
    // A partner receives laundry: its point is a counter.
    if (!receives(site.kind)) throw new RuleError('site_does_not_receive');
    await savePartner(db, organizationId, input);
    return { siteId: input.siteId, partnerName: input.partnerName, commissionPercent: input.commissionPercent };
  },
  summarize: (_input, output) => `Partner point ${output.partnerName}: ${output.commissionPercent} %`,
});

export const unsetPartner = defineCommand({
  name: 'unset-partner-point',
  input: siteRef,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    if (!(await removePartner(db, input.siteId))) throw new RuleError('not_found');
    return { siteId: input.siteId };
  },
  summarize: () => 'Partner point removed',
});

/** How the charges that name no site are spread: by sales, by pieces, or in equal parts. */
export const setAllocation = defineCommand({
  name: 'set-cost-allocation',
  input: allocationInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    await saveAllocation(db, organizationId, input.allocation);
    return input;
  },
  summarize: (input) => `Shared costs spread by ${input.allocation}`,
});
