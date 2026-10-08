import { z } from 'zod';

/**
 * The business events of deposits: what the center may react to. Identifiers and facts only —
 * never a name, a phone nor a price (docs/product/model.md); the manifest lists them (`emits`).
 */
export const orderEvents = [
  {
    type: 'order.received',
    description: 'A deposit was received at a site: its id, how many pieces, whether under a pack.',
    classification: 'internal',
    data: z.object({
      orderId: z.string(),
      siteId: z.string(),
      pieces: z.number(),
      pack: z.boolean(),
      express: z.boolean(),
    }),
  },
  {
    type: 'order.ready',
    description: 'A deposit is ready for its customer: its id and its site.',
    classification: 'internal',
    data: z.object({ orderId: z.string(), siteId: z.string() }),
  },
  {
    type: 'order.collected',
    description: 'A deposit was handed over: its id, its site, whether a balance was left unpaid.',
    classification: 'internal',
    data: z.object({ orderId: z.string(), siteId: z.string(), unpaid: z.boolean() }),
  },
] as const;
