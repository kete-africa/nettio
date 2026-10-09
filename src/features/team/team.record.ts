import { z } from 'zod';

// The inputs of the team's pay gestures: one schema each, shared by the screen, the server and the
// MCP tool.

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);

export const workInput = z.object({
  /** YYYY-MM; the current month by default. */
  month: month.optional(),
});

export const rateInput = z.object({
  stepId: z.string().min(1).max(64),
  /** What the laundry pays for one piece passed at this step; null: not paid by the piece. */
  amount: z.number().int().min(0).max(1_000_000).nullable(),
});

export const namesInput = z.object({});

export const clockInInput = z.object({
  /** The site she works at today; none when the laundry has one. */
  siteId: z.string().min(1).max(64).nullable().default(null),
});
export const clockOutInput = z.object({});
export const presenceInput = z.object({
  /** YYYY-MM-DD; today by default. */
  day: z.iso.date().optional(),
});
