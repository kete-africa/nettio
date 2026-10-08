import { z } from 'zod';

// A customer of the laundry (docs/product/model.md): her phone is her identifier, she has no
// Nettio account, and she chooses how — and whether — the laundry writes to her.

export const customerKinds = ['person', 'business'] as const;
export type CustomerKind = (typeof customerKinds)[number];

/** Always WhatsApp and Telegram (constitution VII); SMS and nothing at all as fallbacks. */
export const customerChannels = ['whatsapp', 'telegram', 'sms', 'none'] as const;
export type CustomerChannel = (typeof customerChannels)[number];

export const customerInput = z.object({
  customerId: z.string().min(1).max(64).optional(),
  phone: z.string().trim().min(6).max(24),
  name: z.string().trim().min(1).max(120),
  kind: z.enum(customerKinds).default('person'),
  channel: z.enum(customerChannels).default('whatsapp'),
  /** She agreed to receive the messages of her deposits. */
  consent: z.boolean().default(true),
  /** Starch, hanger or folded… */
  preferences: z.string().trim().max(300).default(''),
  note: z.string().trim().max(500).default(''),
});

export interface Customer {
  customerId: string;
  phone: string;
  name: string;
  kind: CustomerKind;
  channel: CustomerChannel;
  consent: boolean;
  preferences: string;
  note: string;
  createdAt: Date;
}
