import { z } from 'zod';

// The inputs of a customer's account: one schema each, shared by the screen, the server and the
// MCP tool.

const id = z.string().min(1).max(64);
const money = z.number().int().min(0).max(1_000_000_000);
const methods = ['cash', 'mobile_money', 'card', 'transfer'] as const;

export const customerRef = z.object({ customerId: id });

export const termsInput = z.object({
  customerId: id,
  legalName: z.string().trim().max(160).default(''),
  taxId: z.string().trim().max(60).default(''),
  address: z.string().trim().max(300).default(''),
  /** One invoice for the month's deposits, instead of paying each at pickup. */
  monthlyInvoice: z.boolean().default(false),
  /** Days to pay an invoice; null: the laundry's usual delay. */
  paymentDays: z.number().int().min(0).max(365).nullable().default(null),
});

export const customerPriceInput = z.object({
  customerId: id,
  serviceId: id,
  articleId: id.nullable().default(null),
  /** Her price in F CFA; null removes it — the catalogue's applies again. */
  amount: money.nullable(),
});

export const topUpInput = z.object({
  customerId: id,
  /** The money received. */
  cashed: money.min(1),
  /** The credit it gives; left out: the same amount. */
  credit: money.min(1).optional(),
  method: z.enum(methods),
});

export const subscriptionInput = z.object({
  customerId: id,
  name: z.string().trim().min(1).max(80),
  /** What she pays each month. */
  amount: money.min(1),
  /** The credit a month gives her; left out: the same amount. */
  credit: money.min(1).optional(),
});

export const subscriptionRef = z.object({ subscriptionId: id });

export const cashSubscriptionInput = z.object({
  subscriptionId: id,
  /** « 2026-10 »; left out: this month. */
  period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(),
  method: z.enum(methods),
});

export const quoteInput = z.object({
  customerId: id,
  lines: z
    .array(z.object({ serviceId: id, articleId: id.nullable().default(null), quantity: z.number().positive().max(100_000) }))
    .min(1)
    .max(60),
  /** Days the offer holds. */
  validDays: z.number().int().min(1).max(365).default(30),
  note: z.string().trim().max(500).default(''),
});

export const quoteRef = z.object({ quoteId: id });
export const decideQuoteInput = z.object({ quoteId: id, accepted: z.boolean() });

export const monthRunInput = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
export const noInput = z.object({});
