import { z } from 'zod';
import { paymentMethods } from '@/features/orders';
import { approvalKinds, complaintKinds } from './domain/manager';

// The inputs of the manager's gestures: one schema each, shared by the screen, the server and the
// MCP tool.

const id = z.string().min(1).max(64);
const minute = z.number().int().min(0).max(1440);

export const weekInput = z.object({
  userId: id,
  /** Her hours, day by day (0 = Monday … 6 = Sunday); a day left out is a day off. */
  days: z
    .array(z.object({ weekday: z.number().int().min(0).max(6), startMinute: minute, endMinute: minute }))
    .max(7),
});

export const requestInput = z.object({
  kind: z.enum(approvalKinds),
  orderId: id,
  /** The discount or the refund asked for; nothing for a cancellation. */
  amount: z.number().int().min(0).max(1_000_000_000).default(0),
  /** How a refund is given back. */
  method: z.enum(paymentMethods).optional(),
  reason: z.string().trim().min(1).max(300),
});

export const decideInput = z.object({
  approvalId: id,
  approve: z.boolean(),
  note: z.string().trim().max(300).default(''),
});

export const complaintInput = z.object({
  orderId: id,
  kind: z.enum(complaintKinds),
  description: z.string().trim().min(1).max(1000),
});

export const resolveComplaintInput = z.object({
  complaintId: id,
  /** What was decided and done. */
  resolution: z.string().trim().min(1).max(500),
  /** What the laundry gives, in F CFA; 0 for none. */
  compensation: z.number().int().min(0).max(1_000_000_000).default(0),
});

export const rulesInput = z.object({
  freeDays: z.number().int().min(0).max(365),
  feePerDay: z.number().int().min(0).max(100_000),
  abandonDays: z.number().int().min(7).max(730),
  quickSwitch: z.boolean(),
});

export const orderInput = z.object({ orderId: id });
export const releaseInput = z.object({
  orderId: id,
  /** Where the clothes went: given, sold, thrown away. */
  destination: z.string().trim().min(1).max(300),
});
export const codeInput = z.object({ code: z.string().regex(/^\d{6}$/) });
export const noInput = z.object({});
