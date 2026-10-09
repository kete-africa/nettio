import { defineCommand, type Actor } from '@kete/commands';
import type { SqlExecutor } from '@kete/tenancy';
import { findStaffOf, listSites, plantOf, readSettings, receives } from '@/features/business';
import { priceOf, readCatalog } from '@/features/catalog';
import { customerAt, findCustomer } from '@/features/customers';
// Messages are queued through the outbox's own file: the door of messaging is not needed here.
import { queueOrderMessage } from '@/features/messaging/infrastructure/outbox';
import { attachPayment, checkCashOut, flagBelowCost, guardRail, tillFor } from '@/features/money';
// The door of the workshop depends on this feature: its units are opened through its tables.
import { openUnits } from '@/features/workshop/domain/work';
import { createUnits, unfinishedUnits } from '@/features/workshop/infrastructure/units';
import { personBehind, signer } from '@/lib/actor';
import { RuleError } from '@/lib/rule-error';
import { announce } from '@/platform/announce';
import { askDelivery } from '@/platform/channels';
import { holds } from '@/platform/rights';
import {
  cancel,
  collect,
  markReady,
  orderNumber,
  payment as checkPayment,
  promisedDate,
  refund as checkRefund,
  type PaymentMethod,
} from './domain/order';
import { checkDiscount, priceOrder, type PricedLine } from './domain/pricing';
import {
  insertOrder,
  insertPayment,
  lockOrder,
  noteEvent,
  setLocation,
  setStatus,
  takeNumber,
} from './infrastructure/orders.tables';
import {
  cancelInput,
  collectInput,
  paymentInput,
  readyInput,
  receiveOrderInput,
  refundInput,
  storeInput,
} from './order.record';

/** A person attached to some sites only works there; one attached to none works everywhere. */
async function checkSiteOf(db: SqlExecutor, actor: Actor, siteId: string): Promise<void> {
  const staff = await findStaffOf(db, personBehind(actor));
  if (staff && staff.siteIds.length > 0 && !staff.siteIds.includes(siteId)) {
    throw new RuleError('not_your_site');
  }
}

/** Writes money taken for a deposit, once the rule let it through. */
async function takePayment(
  db: SqlExecutor,
  organizationId: string,
  order: { orderId: string; siteId: string; status: Parameters<typeof checkPayment>[0]['status']; total: number; paid: number },
  money: { amount: number; method: PaymentMethod },
  actor: Actor,
): Promise<number> {
  const kind = checkPayment(order, money.amount);
  // Cash goes into the person's open till at this site (specs/003-money-day).
  const till =
    money.method === 'cash'
      ? await tillFor(db, { cashierId: personBehind(actor), siteId: order.siteId })
      : null;
  const paymentId = await insertPayment(db, organizationId, {
    orderId: order.orderId,
    siteId: order.siteId,
    amount: money.amount,
    method: money.method,
    kind,
    createdBy: personBehind(actor),
  });
  if (till) await attachPayment(db, paymentId, till.sessionId);
  await noteEvent(db, organizationId, {
    orderId: order.orderId,
    kind: 'paid',
    detail: { amount: money.amount, method: money.method, kind },
    actor: signer(actor),
  });
  return order.paid + money.amount;
}

/**
 * Receives a deposit at a counter: its customer, its real content line by line — a pack never
 * dispenses from it — its price, the next number of its site, and the money taken with it. The
 * labels and prices are copied: a later change of the catalogue never touches it.
 */
export const receiveOrder = defineCommand({
  name: 'receive-order',
  input: receiveOrderInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const settings = await readSettings(db);
    if (!settings) throw new RuleError('not_set_up');
    const site = (await listSites(db)).find((s) => s.siteId === input.siteId);
    if (!site?.active) throw new RuleError('not_found');
    if (!receives(site.kind)) throw new RuleError('site_does_not_receive');
    await checkSiteOf(db, actor, site.siteId);

    const customer = input.customerId
      ? await findCustomer(db, input.customerId)
      : input.phone
        ? await customerAt(db, organizationId, { phone: input.phone, name: input.customerName })
        : null;
    if (!customer) throw new RuleError('customer_needed');

    const catalog = await readCatalog(db);
    const items = input.lines.map((line) => {
      const service = catalog.services.find((s) => s.serviceId === line.serviceId && s.active);
      if (!service) throw new RuleError('not_found');
      const articleId = service.pricing === 'per_kg' ? null : line.articleId;
      const article = catalog.articles.find((a) => a.articleId === articleId && a.active);
      if (service.pricing === 'per_piece' && !article) throw new RuleError('not_found');
      const unitPrice = priceOf(catalog.prices, service.serviceId, articleId);
      if (unitPrice === undefined) {
        throw new RuleError('not_sold', {
          name: article ? `${article.name} · ${service.name}` : service.name,
        });
      }
      return { line, service, article: article ?? null, unitPrice };
    });
    const pack = input.packId
      ? catalog.packs.find((p) => p.packId === input.packId && p.active)
      : null;
    if (input.packId && !pack) throw new RuleError('not_found');

    const lines: PricedLine[] = items.map(({ line, service, article, unitPrice }) => ({
      serviceId: service.serviceId,
      articleId: article?.articleId ?? null,
      pricing: service.pricing,
      quantity: line.quantity,
      unitPrice,
    }));
    const price = priceOrder({
      lines,
      pack: pack ?? null,
      expressPercent: input.express ? settings.expressPercent : 0,
      discount: input.discount,
    });
    checkDiscount(price, {
      reason: input.discountReason,
      ceilingPercent: settings.discountCeilingPercent,
      mayExceed: holds('orders:discount'),
    });

    const taken = await takeNumber(db, site.siteId);
    if (!taken) throw new RuleError('not_found');
    const number = orderNumber(taken.code, taken.seq);
    const now = new Date();
    const promisedAt = input.promisedAt
      ? new Date(input.promisedAt)
      : promisedDate(now, settings, input.express);
    const pieces = lines
      .filter((line) => line.pricing === 'per_piece')
      .reduce((sum, line) => sum + line.quantity, 0);
    const kilos = lines
      .filter((line) => line.pricing === 'per_kg')
      .reduce((sum, line) => sum + line.quantity, 0);

    const orderId = await insertOrder(db, organizationId, {
      siteId: site.siteId,
      number,
      customerId: customer.customerId,
      express: input.express,
      packId: pack?.packId ?? null,
      packName: pack?.name ?? null,
      packPrice: price.packPrice,
      pieces,
      kilos,
      subtotal: price.subtotal,
      supplement: price.supplement,
      expressAmount: price.express,
      discount: price.discount,
      discountReason: price.discount > 0 ? (input.discountReason ?? '') : '',
      total: price.total,
      promisedAt,
      note: input.note,
      createdBy: personBehind(actor),
      items: items.map(({ line, service, article, unitPrice }, index) => ({
        serviceId: service.serviceId,
        serviceName: service.name,
        articleId: article?.articleId ?? null,
        articleName: article?.name ?? null,
        pricing: service.pricing,
        quantity: line.quantity,
        unitPrice,
        amount: price.lines[index]?.amount ?? 0,
        covered: price.lines[index]?.covered ?? 0,
        due: price.lines[index]?.due ?? 0,
        defects: line.defects,
      })),
    });
    // The workshop (specs/005-workshop): its units wait at the site that processes the deposit.
    const stepNames = new Map(catalog.steps.map((step) => [step.stepId, step.name]));
    const units = openUnits(
      items.map(({ line, service, article }) => ({
        serviceId: service.serviceId,
        serviceName: service.name,
        route:
          service.nature === 'workshop'
            ? service.stepIds.map((stepId) => ({ stepId, name: stepNames.get(stepId) ?? '' }))
            : [],
        articleName: article?.name ?? null,
        pricing: service.pricing,
        quantity: line.quantity,
      })),
      settings.tracking,
    );
    if (units.length > 0) {
      const plant = plantOf(site, await listSites(db));
      if (!plant) throw new RuleError('site_has_no_plant');
      await createUnits(db, organizationId, { orderId, siteId: plant.siteId, units });
    }
    // The guard-rail (specs/004-earn): said, signed in the history, never blocking.
    const guard = await guardRail(
      db,
      price.total,
      lines.map((line, index) => ({
        serviceId: line.serviceId,
        articleId: line.articleId,
        quantity: line.quantity,
        covered: price.lines[index]?.covered ?? 0,
      })),
    );
    if (guard?.below) await flagBelowCost(db, orderId);
    await noteEvent(db, organizationId, {
      orderId,
      kind: 'received',
      detail: {
        total: price.total,
        ...(pack ? { pack: pack.name } : {}),
        ...(price.discount > 0
          ? { discount: price.discount, reason: input.discountReason ?? '' }
          : {}),
        ...(guard?.below ? { belowCost: true } : {}),
      },
      actor: signer(actor),
    });
    let paid = 0;
    if (input.payment) {
      paid = await takePayment(
        db,
        organizationId,
        { orderId, siteId: site.siteId, status: 'received', total: price.total, paid: 0 },
        input.payment,
        actor,
      );
    }
    // The receipt, when the laundry turned it on: its words, this deposit's figures.
    if (await queueOrderMessage(db, organizationId, { orderId, kind: 'receipt' })) {
      askDelivery(organizationId);
    }
    await announce(db, {
      type: 'order.received',
      organization: organizationId,
      data: { orderId, siteId: site.siteId, pieces, pack: Boolean(pack), express: input.express },
    });
    return {
      orderId,
      number,
      total: price.total,
      paid,
      balance: price.total - paid,
      promisedAt: promisedAt.toISOString(),
      belowCost: guard?.below ?? false,
    };
  },
  summarize: (_input, output) => `Deposit ${output.number} received`,
});

async function opened(db: SqlExecutor, orderId: string) {
  const order = await lockOrder(db, orderId);
  if (!order) throw new RuleError('not_found');
  return order;
}

/** Marks a deposit ready for its customer, and says where it is stored. */
export const markOrderReady = defineCommand({
  name: 'mark-order-ready',
  input: readyInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await opened(db, input.orderId);
    // A deposit is ready when its workshop is done: never with a piece still on a table.
    if ((await unfinishedUnits(db, order.orderId)) > 0) throw new RuleError('workshop_not_finished');
    await setStatus(db, order.orderId, markReady(order.status), { location: input.location });
    await noteEvent(db, organizationId, {
      orderId: order.orderId,
      kind: 'ready',
      detail: input.location ? { location: input.location } : {},
      actor: signer(actor),
    });
    if (await queueOrderMessage(db, organizationId, { orderId: order.orderId, kind: 'ready' })) {
      askDelivery(organizationId);
    }
    await announce(db, {
      type: 'order.ready',
      organization: organizationId,
      data: { orderId: order.orderId, siteId: order.siteId },
    });
    return { orderId: order.orderId, number: order.number, status: 'ready' as const };
  },
  summarize: (_input, output) => `Deposit ${output.number} ready`,
});

/** Says where a deposit is stored, for whoever hands it over. */
export const storeOrder = defineCommand({
  name: 'store-order',
  input: storeInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await opened(db, input.orderId);
    if (order.status === 'collected' || order.status === 'cancelled') {
      throw new RuleError('order_not_open');
    }
    await setLocation(db, order.orderId, input.location);
    await noteEvent(db, organizationId, {
      orderId: order.orderId,
      kind: 'stored',
      detail: { location: input.location },
      actor: signer(actor),
    });
    return { orderId: order.orderId, number: order.number, location: input.location };
  },
  summarize: (input, output) => `Deposit ${output.number} stored at ${input.location}`,
});

/** Takes money for a deposit: an advance, or its balance. Never more than what is due. */
export const recordPayment = defineCommand({
  name: 'record-payment',
  input: paymentInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await opened(db, input.orderId);
    const paid = await takePayment(db, organizationId, order, input, actor);
    return { orderId: order.orderId, number: order.number, paid, balance: order.total - paid };
  },
  summarize: (input, output) => `${input.amount} cashed for deposit ${output.number}`,
});

/**
 * Hands a deposit over to its customer: it is ready, and paid — the balance may be cashed in the
 * same gesture — unless the person may release it unpaid.
 */
export const collectOrder = defineCommand({
  name: 'collect-order',
  input: collectInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await opened(db, input.orderId);
    const paid = input.payment
      ? await takePayment(db, organizationId, order, input.payment, actor)
      : order.paid;
    const status = collect({ ...order, paid }, holds('orders:release_unpaid'));
    await setStatus(db, order.orderId, status);
    const balance = order.total - paid;
    await noteEvent(db, organizationId, {
      orderId: order.orderId,
      kind: 'collected',
      detail: balance > 0 ? { unpaid: balance } : {},
      actor: signer(actor),
    });
    await announce(db, {
      type: 'order.collected',
      organization: organizationId,
      data: { orderId: order.orderId, siteId: order.siteId, unpaid: balance > 0 },
    });
    return { orderId: order.orderId, number: order.number, status, balance };
  },
  summarize: (_input, output) => `Deposit ${output.number} handed over`,
});

/** Cancels a deposit before it is ready, with a reason, once its money was given back. */
export const cancelOrder = defineCommand({
  name: 'cancel-order',
  input: cancelInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await opened(db, input.orderId);
    const status = cancel(order, input.reason);
    await setStatus(db, order.orderId, status, { cancelReason: input.reason });
    await noteEvent(db, organizationId, {
      orderId: order.orderId,
      kind: 'cancelled',
      detail: { reason: input.reason },
      actor: signer(actor),
    });
    return { orderId: order.orderId, number: order.number, status };
  },
  summarize: (_input, output) => `Deposit ${output.number} cancelled`,
});

/** Gives money back on a deposit, with a reason: how an error of the till is corrected. */
export const refundPayment = defineCommand({
  name: 'refund-payment',
  input: refundInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId, actor }) {
    const order = await opened(db, input.orderId);
    checkRefund(order, input.amount, input.reason);
    // Cash comes out of the person's open till, which must hold it.
    const till =
      input.method === 'cash'
        ? await tillFor(db, { cashierId: personBehind(actor), siteId: order.siteId })
        : null;
    if (till) checkCashOut(input.amount, till);
    const paymentId = await insertPayment(db, organizationId, {
      orderId: order.orderId,
      siteId: order.siteId,
      amount: input.amount,
      method: input.method,
      kind: 'refund',
      reason: input.reason,
      createdBy: personBehind(actor),
    });
    if (till) await attachPayment(db, paymentId, till.sessionId);
    await noteEvent(db, organizationId, {
      orderId: order.orderId,
      kind: 'refunded',
      detail: { amount: input.amount, method: input.method, reason: input.reason },
      actor: signer(actor),
    });
    const paid = order.paid - input.amount;
    return { orderId: order.orderId, number: order.number, paid, balance: order.total - paid };
  },
  summarize: (input, output) => `${input.amount} refunded on deposit ${output.number}`,
});

/**
 * Takes money for one deposit from another feature's gesture — an invoice cashed: the same rules
 * as a payment at the counter (the till for cash, never more than what is due).
 */
export async function cashOrder(
  db: SqlExecutor,
  organizationId: string,
  orderId: string,
  money: { amount: number; method: PaymentMethod },
  actor: Actor,
): Promise<number> {
  const order = await opened(db, orderId);
  return takePayment(db, organizationId, order, money, actor);
}
