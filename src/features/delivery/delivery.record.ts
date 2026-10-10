import { z } from 'zod';
import { paymentMethods } from '@/features/orders';
import { deliveryKinds } from './domain/delivery';

// The inputs of collecting and delivering: one schema each, shared by the screen, the server and
// the MCP tool.

const id = z.string().min(1).max(64);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const zoneInput = z.object({
  zoneId: id.optional(),
  name: z.string().trim().min(1).max(80),
  /** What a trip there costs the customer, in F CFA; 0: free. */
  fee: z.number().int().min(0).max(1_000_000),
  active: z.boolean().default(true),
});

export const planInput = z.object({
  kind: z.enum(deliveryKinds),
  /** The deposit to bring back (a delivery). */
  orderId: id.optional(),
  /** Whose laundry is fetched (a collection). */
  customerId: id.optional(),
  zoneId: id,
  address: z.string().trim().min(1).max(300),
  /** Left out: today. */
  plannedOn: day.optional(),
  courierId: id.nullable().default(null),
  note: z.string().trim().max(300).default(''),
});

export const deliveryRef = z.object({ deliveryId: id });
export const assignInput = z.object({ deliveryId: id, courierId: id.nullable() });

export const completeInput = z.object({
  deliveryId: id,
  /** Who received it. */
  recipient: z.string().trim().min(1).max(120),
  note: z.string().trim().max(300).default(''),
  /** What the courier cashed on the deposit. */
  payment: z.object({ amount: z.number().int().min(1).max(1_000_000_000), method: z.enum(paymentMethods) }).optional(),
});

export const failInput = z.object({ deliveryId: id, reason: z.string().trim().min(1).max(300) });
export const boardInput = z.object({ day: day.optional() });
export const ofOrderInput = z.object({ orderId: id });
