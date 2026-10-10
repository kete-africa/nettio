import { z } from 'zod';
import { expenseCategories } from '@/features/money/domain/charges';

// The inputs of stock and purchasing: one schema each, shared by the screen, the server and the
// MCP tool.

const id = z.string().min(1).max(64);
const quantity = z.number().positive().max(10_000_000);
const cost = z.number().int().min(0).max(1_000_000_000);

export const itemInput = z.object({
  itemId: id.optional(),
  name: z.string().trim().min(1).max(80),
  /** How it is counted: L, kg, pièce, carton… */
  unit: z.string().trim().min(1).max(16),
  /** At or under it the laundry wants to be told; 0: never. */
  threshold: z.number().min(0).max(10_000_000).default(0),
  active: z.boolean().default(true),
});

export const supplierInput = z.object({
  supplierId: id.optional(),
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(24).default(''),
  note: z.string().trim().max(300).default(''),
  active: z.boolean().default(true),
});

export const purchaseInput = z.object({
  supplierId: id,
  lines: z.array(z.object({ itemId: id, quantity, unitCost: cost })).min(1).max(60),
  note: z.string().trim().max(300).default(''),
});

export const purchaseRef = z.object({ purchaseId: id });

export const receptionInput = z.object({
  purchaseId: id,
  /** What really arrived of each line, at what it really cost; a line left out did not arrive. */
  lines: z.array(z.object({ lineId: id, quantity: z.number().min(0).max(10_000_000), unitCost: cost })).min(1).max(60),
});

export const useInput = z.object({
  itemId: id,
  quantity,
  /** Lost, spilled, expired — not used for the work. */
  loss: z.boolean().default(false),
  note: z.string().trim().max(300).default(''),
});

export const countInput = z.object({
  counts: z.array(z.object({ itemId: id, counted: z.number().min(0).max(10_000_000) })).min(1).max(200),
});

export const supplierPaymentInput = z.object({
  supplierId: id,
  amount: cost.min(1),
  paidFrom: z.enum(['till', 'mobile_money', 'bank', 'other']),
  /** What kind of charge it is, for the month's result. */
  category: z.enum(expenseCategories).default('detergent'),
  /** The site whose till pays, when it is paid from a till. */
  siteId: id.nullable().default(null),
});

export const monthInput = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });
