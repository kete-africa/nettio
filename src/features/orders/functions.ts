import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import type { Site } from '@/features/business';
import type { Article, Pack, Price, Service } from '@/features/catalog';
import { getModel, getTranscriber } from '@/platform/ai';
import { holds } from '@/platform/rights';
import { perform, signedIn } from '@/platform/screen';
import type { DaySummary } from './infrastructure/orders.tables';
import { pictureTypes, understandDeposit, type UnderstandOutcome } from './understand';
import {
  cancelInput,
  collectInput,
  paymentInput,
  readyInput,
  receiveOrderInput,
  refundInput,
  storeInput,
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
  /** Whether a deposit may be said in a sentence, dictated, photographed (specs/011, 014). */
  dictation: { text: boolean; voice: boolean; photo: boolean };
}

/** The key of a gesture: the same one sent twice — a double tap, a retry — runs once. */
const key = z.string().regex(/^[A-Za-z0-9_.:-]{8,128}$/);

export const fetchCounter = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<Omit<Counter, 'dictation'>>('orders_counter', {});
  if (!read.ok) return null;
  return {
    ...read.output,
    dictation: {
      text: getModel() !== null,
      voice: getModel() !== null && getTranscriber() !== null,
      photo: getModel() !== null,
    },
  };
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

export const storeOrder = createServerFn({ method: 'POST' })
  .validator((input: unknown) => storeInput.parse(input))
  .handler(({ data }) => perform<{ orderId: string }>('orders_store', data));

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

/**
 * A deposit said in a sentence, dictated, or photographed: what Nettio understood of it, to fill
 * the counter's form. Nothing is saved here; the person checks and saves the deposit herself.
 */
export const understand = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .union([
        z.object({ text: z.string().trim().min(2).max(1500) }),
        // A recording of a few seconds, base64: 3 MB at most.
        z.object({ audio: z.string().min(100).max(4_200_000) }),
        // A picture the screen made smaller first, base64: 3 MB at most.
        z.object({ image: z.string().min(100).max(4_200_000), mediaType: z.enum(pictureTypes) }),
      ])
      .parse(input),
  )
  .handler(
    async ({ data }): Promise<UnderstandOutcome | { available: false; reason: 'not_allowed' }> => {
      const { identity, caller, as } = await signedIn();
      const counter = await perform<Omit<Counter, 'dictation'>>('orders_counter', {});
      return as(async () => {
        if (!counter.ok || !holds('orders:create')) {
          return { available: false as const, reason: 'not_allowed' as const };
        }
        return understandDeposit(
          { userId: identity.userId, organizationId: caller.organizationId },
          'text' in data
            ? { text: data.text }
            : 'audio' in data
              ? { audio: new Uint8Array(Buffer.from(data.audio, 'base64')) }
              : { image: new Uint8Array(Buffer.from(data.image, 'base64')), mediaType: data.mediaType },
          counter.output.catalog,
        );
      });
    },
  );
