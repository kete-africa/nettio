import { z } from 'zod';
import { messageKinds } from './domain/messages';

// The inputs of the messaging gestures: one schema each, shared by the screen, the server and the
// MCP tool.

export const templateInput = z.object({
  kind: z.enum(messageKinds),
  /** Off until the laundry turns it on: nothing leaves otherwise. */
  enabled: z.boolean(),
  /** The laundry's words, with {client}, {numero}, {contenu}, {total}, {paye}, {reste}, {date}, {pressing}. */
  body: z.string().trim().min(1).max(1000),
  /** The name of the approved template with the same words at the messaging provider, if any. */
  providerTemplate: z
    .string()
    .trim()
    .regex(/^[a-z0-9_]{0,64}$/)
    .default(''),
});

export const resendInput = z.object({ messageId: z.string().min(1).max(64) });

export const remindInput = z.object({});
