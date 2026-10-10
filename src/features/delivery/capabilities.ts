import { defineCapability } from '@kete/capabilities';
import { listStaff } from '@/features/business/infrastructure/business.tables';
import { personBehind } from '@/lib/actor';
import { holds } from '@/platform/rights';
import {
  assignCourier,
  cancelDelivery,
  completeDelivery,
  failDelivery,
  planDelivery,
  setZone,
  startDelivery,
} from './commands';
import {
  assignInput,
  boardInput,
  completeInput,
  deliveryRef,
  failInput,
  ofOrderInput,
  planInput,
  zoneInput,
} from './delivery.record';
import { roundOf } from './domain/delivery';
import {
  findDelivery,
  lastAddressOf,
  listDeliveries,
  listZones,
  orderToDeliver,
  type Delivery,
  type Zone,
} from './infrastructure/delivery.tables';

export interface DeliveryBoard {
  day: string;
  zones: Zone[];
  /** Every trip of the day, for who plans; a courier's own and the unassigned ones otherwise. */
  trips: Delivery[];
  /** The person's own round: hers, and what nobody took yet. */
  round: Delivery[];
  couriers: { userId: string; name: string }[];
  me: string;
  mayPlan: boolean;
  mayRun: boolean;
}

const today = (): string => new Date().toISOString().slice(0, 10);

/**
 * What a screen, a copilot or an agent may do with collections and deliveries. Reading is level
 * 1. A trip planned, started or closed commits the laundry — and a delivery hands a deposit over
 * and may cash it: an agent only prepares it.
 */
export const deliveryCapabilities = [
  defineCapability({
    name: 'delivery_board',
    description:
      'The collections and deliveries of a day (today by default) with those still open from before: customer, address, zone and fee, the deposit and what is still owed on it, the courier, the state and the proof — and the zones with their fees.',
    permission: 'delivery:read',
    autonomy: 1,
    classification: 'confidential',
    input: boardInput,
    async run(input, { db, actor }): Promise<DeliveryBoard> {
      const day = input.day ?? today();
      const me = personBehind(actor);
      const mayPlan = holds('delivery:plan');
      const mine = await listDeliveries(db, { day, courierId: me });
      return {
        day,
        zones: await listZones(db),
        trips: mayPlan ? await listDeliveries(db, { day }) : mine,
        round: roundOf(mine.filter((trip) => trip.status === 'planned' || trip.status === 'out')),
        couriers: (await listStaff(db))
          .filter((member) => member.active && (member.role === 'courier' || member.role === 'owner' || member.role === 'manager'))
          .map((member) => ({ userId: member.userId, name: member.name })),
        me,
        mayPlan,
        mayRun: holds('delivery:run'),
      };
    },
  }),
  defineCapability({
    name: 'delivery_of_order',
    description:
      'The trips planned or made for a deposit, the zones where the laundry delivers, and the last address it went to for this customer.',
    permission: 'delivery:read',
    autonomy: 1,
    classification: 'confidential',
    input: ofOrderInput,
    async run(input, { db }) {
      const order = await orderToDeliver(db, input.orderId);
      return {
        trips: await listDeliveries(db, { day: today(), orderId: input.orderId }),
        zones: (await listZones(db)).filter((zone) => zone.active),
        last: order ? await lastAddressOf(db, order.customerId) : null,
      };
    },
  }),
  defineCapability({
    name: 'delivery_get',
    description: 'One collection or delivery, as its slip says it: customer, address, deposit, fee, what to collect, the proof.',
    permission: 'delivery:read',
    autonomy: 1,
    classification: 'confidential',
    input: deliveryRef,
    run: (input, { db }) => findDelivery(db, input.deliveryId),
  }),
  defineCapability({
    name: 'delivery_set_zone',
    description: 'Creates or changes a zone the laundry goes to and what a trip there costs the customer. The laundry’s decision alone.',
    permission: 'settings:manage',
    autonomy: 3,
    input: zoneInput,
    command: setZone,
    draft: { recordType: 'delivery_zone' },
  }),
  defineCapability({
    name: 'delivery_plan',
    description:
      'Plans a trip for a day: a delivery brings a deposit back (its zone’s fee joins the deposit’s price), a collection fetches laundry at a customer’s.',
    permission: 'delivery:plan',
    autonomy: 3,
    input: planInput,
    command: planDelivery,
    draft: { recordType: 'delivery' },
  }),
  defineCapability({
    name: 'delivery_assign',
    description: 'Gives a planned trip to a courier, or takes it back.',
    permission: 'delivery:plan',
    autonomy: 3,
    input: assignInput,
    command: assignCourier,
    draft: { recordType: 'delivery_courier' },
  }),
  defineCapability({
    name: 'delivery_cancel',
    description: 'Cancels a trip nobody left for: its fee leaves the deposit’s price.',
    permission: 'delivery:plan',
    autonomy: 3,
    input: deliveryRef,
    command: cancelDelivery,
    draft: { recordType: 'delivery_cancellation' },
  }),
  defineCapability({
    name: 'delivery_start',
    description: 'The courier leaves with a planned trip: it becomes hers, and the customer is told.',
    permission: 'delivery:run',
    autonomy: 3,
    input: deliveryRef,
    command: startDelivery,
    draft: { recordType: 'delivery_start' },
  }),
  defineCapability({
    name: 'delivery_complete',
    description:
      'Closes a trip with its proof — who received it. A delivery hands the deposit over, and cashes what the courier was paid.',
    permission: 'delivery:run',
    autonomy: 4,
    input: completeInput,
    command: completeDelivery,
    draft: { recordType: 'delivery_proof' },
  }),
  defineCapability({
    name: 'delivery_fail',
    description: 'Closes a trip that could not be done, with its reason.',
    permission: 'delivery:run',
    autonomy: 3,
    input: failInput,
    command: failDelivery,
    draft: { recordType: 'delivery_failure' },
  }),
];
