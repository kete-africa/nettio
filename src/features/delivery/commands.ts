import { defineCommand } from '@kete/commands';
import { findStaffOf } from '@/features/business';
import { findCustomer } from '@/features/customers';
import { queueOrderNote } from '@/features/messaging/infrastructure/outbox';
import { collectOrder } from '@/features/orders/commands';
import { noteEvent } from '@/features/orders/infrastructure/orders.tables';
import { personBehind, signer } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import * as m from '@/paraglide/messages.js';
import { askDelivery } from '@/platform/channels';
import { assignInput, completeInput, deliveryRef, failInput, planInput, zoneInput } from './delivery.record';
import { checkClose, checkPlan, checkProof, checkStart } from './domain/delivery';
import {
  closeDelivery,
  findDelivery,
  insertDelivery,
  listZones,
  markOut,
  moveDeliveryFee,
  orderToDeliver,
  saveZone,
  setCourier,
} from './infrastructure/delivery.tables';

const today = (): string => new Date().toISOString().slice(0, 10);

/** A zone and what a trip there costs the customer: the laundry's decision. */
export const setZone = defineCommand({
  name: 'set-delivery-zone',
  input: zoneInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const zoneId = await saveZone(db, organizationId, input);
    if (zoneId === null) throw new RuleError('zone_name_taken');
    if (zoneId === '') throw new RuleError('not_found');
    return { zoneId, name: input.name, fee: input.fee };
  },
  summarize: (_input, output) => `Zone ${output.name}: ${output.fee}`,
});

/**
 * Plans a trip. A delivery brings a deposit back: its zone's fee joins the deposit's price at
 * once, so that the courier collects the right amount. A collection fetches laundry at a
 * customer's: its deposit is recorded at the counter when it arrives.
 */
export const planDelivery = defineCommand({
  name: 'plan-delivery',
  input: planInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const zone = (await listZones(db)).find((each) => each.zoneId === input.zoneId && each.active);
    if (!zone) throw new RuleError('not_found');
    const order = input.kind === 'deliver' && input.orderId ? await orderToDeliver(db, input.orderId) : null;
    const customerId = input.kind === 'deliver' ? order?.customerId : input.customerId;
    if (!customerId || !(await findCustomer(db, customerId))) throw new RuleError('not_found');
    if (input.courierId && !(await findStaffOf(db, input.courierId))?.active) throw new RuleError('not_found');
    checkPlan({ kind: input.kind, address: input.address, order, fee: zone.fee });
    // Only a deposit carries a fee: a collection has none to add it to yet.
    const fee = input.kind === 'deliver' ? zone.fee : 0;
    const orderId = input.kind === 'deliver' ? (input.orderId ?? null) : null;
    const deliveryId = await insertDelivery(db, organizationId, {
      kind: input.kind,
      customerId,
      orderId,
      zoneId: zone.zoneId,
      zoneName: zone.name,
      fee,
      address: input.address,
      plannedOn: input.plannedOn ?? today(),
      courierId: input.courierId,
      note: input.note,
      createdBy: personBehind(actor),
    });
    if (!deliveryId) throw new RuleError('delivery_already_planned');
    if (orderId && fee > 0) {
      await moveDeliveryFee(db, orderId, fee);
      await noteEvent(db, organizationId, {
        orderId,
        kind: 'delivery_fee',
        detail: { amount: fee, zone: zone.name },
        actor: signer(actor),
      });
    }
    return { deliveryId, kind: input.kind, zone: zone.name, fee, number: order?.number ?? null };
  },
  summarize: (_input, output) => `${output.kind === 'deliver' ? 'Delivery' : 'Collection'} planned in ${output.zone}`,
});

export const assignCourier = defineCommand({
  name: 'assign-courier',
  input: assignInput,
  reversibility: { reversible: false },
  async handler(input, { db }) {
    const delivery = await findDelivery(db, input.deliveryId, true);
    if (!delivery) throw new RuleError('not_found');
    checkStart(delivery.status);
    if (input.courierId && !(await findStaffOf(db, input.courierId))?.active) throw new RuleError('not_found');
    await setCourier(db, delivery.deliveryId, input.courierId);
    return { deliveryId: delivery.deliveryId, courierId: input.courierId };
  },
  summarize: (_input, output) => (output.courierId ? 'Courier assigned' : 'Courier removed'),
});

/** The courier leaves: the trip is hers, and the customer is told her laundry is on its way. */
export const startDelivery = defineCommand({
  name: 'start-delivery',
  input: deliveryRef,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const delivery = await findDelivery(db, input.deliveryId, true);
    if (!delivery) throw new RuleError('not_found');
    checkStart(delivery.status);
    const courierId = personBehind(actor);
    // A trip given to someone else is not taken from her.
    if (delivery.courierId && delivery.courierId !== courierId) throw new RuleError('delivery_not_yours');
    if (delivery.kind === 'deliver' && delivery.orderStatus !== 'ready') throw new RuleError('order_not_ready');
    await markOut(db, delivery.deliveryId, courierId);
    const told = delivery.orderId
      ? await queueOrderNote(db, organizationId, {
          orderId: delivery.orderId,
          body: (facts) => m.trip_on_the_way({ numero: facts.number, pressing: facts.business }, { locale: 'fr' }),
        })
      : false;
    if (told) askDelivery(organizationId);
    return { deliveryId: delivery.deliveryId, customerTold: told };
  },
  summarize: () => 'Courier on the way',
});

/**
 * Handed over, with its proof: who received it. A delivery hands the deposit over under the
 * deposit's own rules — what is owed is cashed by the courier, into her own till for cash.
 */
export const completeDelivery = defineCommand({
  name: 'complete-delivery',
  input: completeInput,
  reversibility: { reversible: false },
  async handler(input, context) {
    const { db, actor } = context;
    const delivery = await findDelivery(db, input.deliveryId, true);
    if (!delivery) throw new RuleError('not_found');
    checkClose(delivery.status);
    checkProof(input.recipient);
    const courierId = personBehind(actor);
    if (delivery.courierId && delivery.courierId !== courierId) throw new RuleError('delivery_not_yours');
    if (delivery.kind === 'collect' && input.payment) throw new RuleError('invalid_input');
    if (delivery.kind === 'deliver' && delivery.orderId) {
      await collectOrder.handler(
        { orderId: delivery.orderId, ...(input.payment ? { payment: input.payment } : {}) },
        context,
      );
    }
    await closeDelivery(db, delivery.deliveryId, {
      status: 'done',
      courierId,
      recipient: input.recipient,
      proofNote: input.note,
      cashed: input.payment?.amount ?? 0,
    });
    return {
      deliveryId: delivery.deliveryId,
      kind: delivery.kind,
      number: delivery.orderNumber,
      cashed: input.payment?.amount ?? 0,
    };
  },
  summarize: (_input, output) =>
    output.kind === 'deliver' ? `Deposit ${output.number} delivered` : 'Laundry collected',
});

/** Nobody was there, or it could not be done: said with its reason. The fee of the trip stays. */
export const failDelivery = defineCommand({
  name: 'fail-delivery',
  input: failInput,
  reversibility: { reversible: false },
  async handler(input, { db, actor }) {
    const delivery = await findDelivery(db, input.deliveryId, true);
    if (!delivery) throw new RuleError('not_found');
    checkClose(delivery.status);
    const courierId = personBehind(actor);
    if (delivery.courierId && delivery.courierId !== courierId) throw new RuleError('delivery_not_yours');
    await closeDelivery(db, delivery.deliveryId, { status: 'failed', courierId, failure: input.reason });
    return { deliveryId: delivery.deliveryId };
  },
  summarize: () => 'Delivery failed',
});

/** A trip nobody left for is cancelled: its fee leaves the deposit's price. */
export const cancelDelivery = defineCommand({
  name: 'cancel-delivery',
  input: deliveryRef,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const delivery = await findDelivery(db, input.deliveryId, true);
    if (!delivery) throw new RuleError('not_found');
    checkStart(delivery.status);
    if (delivery.orderId && delivery.fee > 0) {
      const order = await orderToDeliver(db, delivery.orderId);
      if (!order) throw new RuleError('not_found');
      if (order.invoiced) throw new RuleError('already_invoiced');
      // What was already paid on the fee is given back first.
      if (order.paid > order.total - delivery.fee) throw new RuleError('refund_first', { amount: order.paid });
      await moveDeliveryFee(db, delivery.orderId, -delivery.fee);
      await noteEvent(db, organizationId, {
        orderId: delivery.orderId,
        kind: 'delivery_cancelled',
        detail: { amount: delivery.fee },
        actor: signer(actor),
      });
    }
    await closeDelivery(db, delivery.deliveryId, { status: 'cancelled' });
    return { deliveryId: delivery.deliveryId, fee: delivery.fee };
  },
  summarize: () => 'Delivery cancelled',
});
