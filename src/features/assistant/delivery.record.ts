import { z } from 'zod';

// The inputs of the statement's gestures: one schema each, shared by the screen, the server and
// the MCP tool.

export const deliveryInput = z.object({
  /** Off until the laundry turns it on: nothing leaves otherwise. */
  enabled: z.boolean(),
  /** The hour of the day the statement leaves at, 0 to 23, in universal time (the time of Lomé). */
  hour: z.number().int().min(0).max(23),
  language: z.enum(['fr', 'en']).default('fr'),
  /** An e-mail address, or nothing. */
  email: z.union([z.literal(''), z.email().max(254)]).default(''),
  /** A WhatsApp number as the owner types it, or nothing; a local number takes the laundry's prefix. */
  whatsapp: z.string().trim().max(24).default(''),
  /** Forgets the Telegram chat that receives the statement. */
  unlinkTelegram: z.boolean().default(false),
});

export const sendNowInput = z.object({});
