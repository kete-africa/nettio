import { z } from 'zod';
import { paymentMethods, type OrderStatus, type PaymentKind, type PaymentMethod } from './domain/order';

// A deposit as the counter receives it (docs/product/model.md): its real content, always — a pack
// never dispenses from entering it — and the money it brings.

const id = z.string().min(1).max(64);
const amount = z.number().int().min(0).max(100_000_000);
const reason = z.string().trim().max(300);

export const orderLineInput = z.object({
  serviceId: id,
  /** Null for a per-kilo service. */
  articleId: id.nullable().default(null),
  /** Pieces, or kilos. */
  quantity: z.number().positive().max(10_000),
  /** What was there before the laundry touched it: a stain, a missing button. */
  defects: z.string().trim().max(300).default(''),
});

export const paymentInput = z.object({
  orderId: id,
  amount: amount.min(1),
  method: z.enum(paymentMethods),
});

export const receiveOrderInput = z.object({
  siteId: id,
  /** A known customer, or a phone — with a name when the laundry does not know it yet. */
  customerId: id.optional(),
  phone: z.string().trim().max(24).optional(),
  customerName: z.string().trim().max(120).optional(),
  lines: z.array(orderLineInput).min(1).max(100),
  packId: id.nullable().default(null),
  express: z.boolean().default(false),
  discount: amount.default(0),
  discountReason: reason.optional(),
  /** When it is promised for; proposed from the settings when absent. */
  promisedAt: z.iso.datetime().optional(),
  note: z.string().trim().max(500).default(''),
  /** Money taken at the counter with the deposit. */
  payment: z.object({ amount: amount.min(1), method: z.enum(paymentMethods) }).optional(),
});

export const orderRefInput = z.object({ orderId: id });

export const readyInput = z.object({
  orderId: id,
  /** Where it is stored, for whoever hands it over. */
  location: z.string().trim().max(60).default(''),
});

export const storeInput = z.object({ orderId: id, location: z.string().trim().min(1).max(60) });

export const collectInput = z.object({
  orderId: id,
  /** The balance, cashed with the handing over. */
  payment: z.object({ amount: amount.min(1), method: z.enum(paymentMethods) }).optional(),
});

export const cancelInput = z.object({ orderId: id, reason: reason.min(1) });

export const refundInput = z.object({
  orderId: id,
  amount: amount.min(1),
  method: z.enum(paymentMethods),
  reason: reason.min(1),
});

export interface OrderItem {
  itemId: string;
  serviceId: string;
  serviceName: string;
  articleId: string | null;
  articleName: string | null;
  pricing: 'per_piece' | 'per_kg';
  quantity: number;
  unitPrice: number;
  /** Its normal price. */
  amount: number;
  /** What the pack covers of it. */
  covered: number;
  /** What is due for it beyond the pack. */
  due: number;
  defects: string;
}

export interface Payment {
  paymentId: string;
  amount: number;
  method: PaymentMethod;
  kind: PaymentKind;
  reason: string;
  createdBy: string;
  createdAt: Date;
}

export interface OrderEvent {
  kind: string;
  /** Facts of the gesture: an amount, a method, a reason. */
  detail: Record<string, string | number | boolean>;
  actorId: string;
  actorKind: string;
  at: Date;
}

/** A deposit in a list. */
export interface OrderSummary {
  orderId: string;
  number: string;
  siteId: string;
  customerId: string;
  customerName: string;
  status: OrderStatus;
  express: boolean;
  pieces: number;
  total: number;
  paid: number;
  promisedAt: Date;
  createdAt: Date;
}

/** A deposit in full: its content, its money, its history. */
export interface Order extends OrderSummary {
  customerPhone: string;
  packId: string | null;
  packName: string | null;
  packPrice: number;
  subtotal: number;
  supplement: number;
  expressAmount: number;
  discount: number;
  discountReason: string;
  note: string;
  location: string;
  cancelReason: string;
  readyAt: Date | null;
  collectedAt: Date | null;
  items: OrderItem[];
  payments: Payment[];
  events: OrderEvent[];
}
