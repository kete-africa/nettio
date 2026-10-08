import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { findStaffOf, listSites, readSettings, receives } from '@/features/business';
import { readCatalog } from '@/features/catalog';
import { RuleError } from '@/lib/rule-error';
import { holds } from '@/platform/rights';
import {
  cancelOrder,
  collectOrder,
  markOrderReady,
  receiveOrder,
  recordPayment,
  refundPayment,
} from './commands';
import { daySummary, findOrder, listOrders } from './infrastructure/orders.tables';
import {
  cancelInput,
  collectInput,
  paymentInput,
  readyInput,
  receiveOrderInput,
  refundInput,
} from './order.record';

/** The day of the laundry, at Lomé's hour (UTC, all year): from midnight to midnight. */
export function dayBounds(day?: string): { from: Date; to: Date } {
  const from = day ? new Date(`${day}T00:00:00.000Z`) : new Date();
  from.setUTCHours(0, 0, 0, 0);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

/**
 * What a screen, a copilot or an agent may do with deposits. Reading is level 1. Receiving a
 * deposit commits the laundry: an agent prepares it (level 3 — a voice note, a photo), a person
 * validates. Money, handing over and cancelling are level 4: always a person, who confirms
 * (constitution III).
 */
export const orderCapabilities = [
  defineCapability({
    name: 'orders_counter',
    description:
      'What the counter needs to receive a deposit: the sites the person may receive at, the catalogue in use, the delays, the express surcharge and the discount ceiling.',
    permission: 'orders:create',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db, actor }) {
      const settings = await readSettings(db);
      if (!settings) throw new RuleError('not_set_up');
      const person = actor.kind === 'person' ? actor.id : (actor.onBehalfOf?.id ?? actor.id);
      const staff = await findStaffOf(db, person);
      const mine = (siteId: string) =>
        !staff || staff.siteIds.length === 0 || staff.siteIds.includes(siteId);
      const catalog = await readCatalog(db);
      return {
        sites: (await listSites(db)).filter(
          (site) => site.active && receives(site.kind) && mine(site.siteId),
        ),
        catalog: {
          articles: catalog.articles.filter((a) => a.active),
          services: catalog.services.filter((s) => s.active),
          prices: catalog.prices,
          packs: catalog.packs.filter((p) => p.active),
        },
        settings: {
          promisedHours: settings.promisedHours,
          expressHours: settings.expressHours,
          expressPercent: settings.expressPercent,
          discountCeilingPercent: settings.discountCeilingPercent,
          phonePrefix: settings.phonePrefix,
        },
        mayExceedDiscount: holds('orders:discount'),
        mayCollect: holds('payments:collect'),
      };
    },
  }),
  defineCapability({
    name: 'orders_list',
    description:
      'The deposits of the laundry by stage (open: received or in progress; ready; closed: collected or cancelled; all), optionally for a site, a customer, or a text (number, name, phone).',
    permission: 'orders:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({
      stage: z.enum(['open', 'ready', 'closed', 'all']).default('all'),
      siteId: z.string().max(64).optional(),
      customerId: z.string().max(64).optional(),
      text: z.string().trim().max(120).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    run: (input, { db }) => listOrders(db, input),
  }),
  defineCapability({
    name: 'orders_get',
    description:
      'One deposit in full, by identifier or by number (A-0412): its customer, its real content line by line, its pack, its money, its payments and its history.',
    permission: 'orders:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({
      orderId: z.string().max(64).optional(),
      number: z.string().trim().max(20).optional(),
    }),
    async run(input, { db }) {
      if (input.orderId) return findOrder(db, { orderId: input.orderId });
      if (input.number) return findOrder(db, { number: input.number });
      return null;
    },
  }),
  defineCapability({
    name: 'orders_today',
    description:
      'The figures of a day (today by default), for a site or all: deposits received, pieces, money cashed, deposits ready and waiting, dormant ones, late ones, and what customers still owe. Computed by code.',
    permission: 'orders:read',
    autonomy: 1,
    input: z.object({
      day: z.iso.date().optional(),
      siteId: z.string().max(64).optional(),
    }),
    async run(input, { db }) {
      const settings = await readSettings(db);
      const bounds = dayBounds(input.day);
      return {
        day: bounds.from.toISOString().slice(0, 10),
        ...(await daySummary(db, {
          ...bounds,
          siteId: input.siteId,
          dormantDays: settings?.dormantDays ?? 30,
        })),
      };
    },
  }),
  defineCapability({
    name: 'orders_receive',
    description:
      'Receives a deposit at a counter: the customer (id, or phone and name), the real content line by line (service, article, quantity or kilos, defects), the pack if any, express, discount with its reason, money taken. Always enter the real content, even under a pack.',
    permission: 'orders:create',
    autonomy: 3,
    input: receiveOrderInput,
    command: receiveOrder,
    draft: { recordType: 'order' },
  }),
  defineCapability({
    name: 'orders_mark_ready',
    description: 'Marks a deposit ready for its customer, and says where it is stored.',
    permission: 'workshop:operate',
    autonomy: 3,
    input: readyInput,
    command: markOrderReady,
    draft: { recordType: 'order_ready' },
  }),
  defineCapability({
    name: 'orders_collect',
    description:
      'Hands a ready deposit over to its customer; the balance may be cashed in the same gesture.',
    permission: 'payments:collect',
    autonomy: 4,
    input: collectInput,
    command: collectOrder,
    draft: { recordType: 'order_collection' },
  }),
  defineCapability({
    name: 'orders_cancel',
    description: 'Cancels a deposit that is not ready yet, with a reason.',
    permission: 'orders:cancel',
    autonomy: 4,
    input: cancelInput,
    command: cancelOrder,
    draft: { recordType: 'order_cancellation' },
  }),
  defineCapability({
    name: 'payments_record',
    description:
      'Takes money for a deposit (cash, mobile_money, card, transfer): an advance or its balance, never more than what is due.',
    permission: 'payments:collect',
    autonomy: 4,
    input: paymentInput,
    command: recordPayment,
    draft: { recordType: 'payment' },
  }),
  defineCapability({
    name: 'payments_refund',
    description: 'Gives money back on a deposit, with a reason: how a till error is corrected.',
    permission: 'payments:refund',
    autonomy: 4,
    input: refundInput,
    command: refundPayment,
    draft: { recordType: 'refund' },
  }),
];
