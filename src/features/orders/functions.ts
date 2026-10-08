import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { Site } from '@/features/business';
import type { Article, Pack, Price, Service } from '@/features/catalog';
import { perform } from '@/platform/screen';
import type { DaySummary } from './infrastructure/orders.tables';
import {
  cancelInput,
  collectInput,
  paymentInput,
  readyInput,
  receiveOrderInput,
  refundInput,
  type Order,
  type OrderSummary,
} from './order.record';

/** What the counter's screen works with. */
export interface Counter {
  sites: Site[];
  catalog: { articles: Article[]; services: Service[]; prices: Price[]; packs: Pack[] };
  settings: {
    promisedHours: number;
    expressHours: number;
    expressPercent: number;
    discountCeilingPercent: number;
    phonePrefix: string;
  };
  mayExceedDiscount: boolean;
  mayCollect: boolean;
}

/** The key of a gesture: the same one sent twice — a double tap, a retry — runs once. */
const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);

export const fetchCounter = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<Counter>('orders_counter', {});
  return read.ok ? read.output : null;
});

export const fetchOrders = createServerFn({ method: 'GET' })
  .validator((input: unknown) =>
    z
      .object({
        stage: z.enum(['open', 'ready', 'closed', 'all']).default('open'),
        text: z.string().trim().max(120).optional(),
        customerId: z.string().max(64).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const read = await perform<OrderSummary[]>('orders_list', { ...data, limit: 100 });
    return read.ok ? read.output : null;
  });

export const fetchOrder = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ orderId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const read = await perform<Order | null>('orders_get', data);
    return read.ok ? read.output : null;
  });

export const fetchToday = createServerFn({ method: 'GET' }).handler(async () => {
  const [summary, latest] = [
    await perform<DaySummary & { day: string }>('orders_today', {}),
    await perform<OrderSummary[]>('orders_list', { stage: 'all', limit: 6 }),
  ];
  return {
    summary: summary.ok ? summary.output : null,
    latest: latest.ok ? latest.output : [],
  };
});

export const receiveOrder = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, order: receiveOrderInput }).parse(input))
  .handler(({ data }) =>
    perform<{ orderId: string; number: string; total: number; paid: number; balance: number }>(
      'orders_receive',
      data.order,
      data.key,
    ),
  );

export const markReady = createServerFn({ method: 'POST' })
  .validator((input: unknown) => readyInput.parse(input))
  .handler(({ data }) => perform<{ orderId: string }>('orders_mark_ready', data));

export const collectOrder = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, collection: collectInput }).parse(input))
  .handler(({ data }) =>
    perform<{ orderId: string; balance: number }>('orders_collect', data.collection, data.key),
  );

export const cancelOrder = createServerFn({ method: 'POST' })
  .validator((input: unknown) => cancelInput.parse(input))
  .handler(({ data }) => perform<{ orderId: string }>('orders_cancel', data));

export const recordPayment = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, payment: paymentInput }).parse(input))
  .handler(({ data }) =>
    perform<{ orderId: string; balance: number }>('payments_record', data.payment, data.key),
  );

export const refundPayment = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ key, refund: refundInput }).parse(input))
  .handler(({ data }) =>
    perform<{ orderId: string; balance: number }>('payments_refund', data.refund, data.key),
  );

/** The guard-rail while a deposit is typed: under its variable cost, or not, or not known. */
export const checkCost = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        total: z.number().int().min(0),
        lines: z
          .array(
            z.object({
              serviceId: z.string().max(64),
              articleId: z.string().max(64).nullable(),
              quantity: z.number().positive(),
            }),
          )
          .max(100),
      })
      .parse(input),
  )
  .handler(({ data }) =>
    perform<{ below: boolean; variableCost: number | null } | null>('orders_check_cost', data),
  );
