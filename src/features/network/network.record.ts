import { z } from 'zod';
import { allocationKeys } from './domain/network';

// The inputs of a laundry with several sites: one schema each, shared by the screen, the server
// and the MCP tool.

const id = z.string().min(1).max(64);

export const sendInput = z.object({
  fromSiteId: id,
  toSiteId: id,
  orderIds: z.array(id).min(1).max(300),
  note: z.string().trim().max(300).default(''),
});

export const receiveInput = z.object({
  transferId: id,
  /** The deposits found when the slip was checked; the others are said missing. */
  receivedOrderIds: z.array(id).max(300),
  note: z.string().trim().max(300).default(''),
});

export const transferRef = z.object({ transferId: id });

export const partnerInput = z.object({
  siteId: id,
  partnerName: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(24).default(''),
  /** What the laundry gives the partner on what its point received, in percent. */
  commissionPercent: z.number().min(0).max(100),
});

export const siteRef = z.object({ siteId: id });
export const allocationInput = z.object({ allocation: z.enum(allocationKeys) });
export const monthInput = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });
export const noInput = z.object({});
