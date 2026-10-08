import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getLocale } from '@/paraglide/runtime.js';
import { perform } from '@/platform/screen';
import type { MessageKind } from './domain/messages';
import type { Message, MessageTemplate } from './infrastructure/outbox';
import { resendInput, templateInput } from './message.record';
import { defaultTemplates } from './reply-words';

export interface MessagingView {
  templates: MessageTemplate[];
  /** The words Nettio proposes for a kind the laundry never wrote. */
  defaults: Record<MessageKind, string>;
  placeholders: string[];
  channels: { whatsapp: boolean; telegram: boolean };
  messages: Message[];
}

export const fetchMessaging = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MessagingView | null> => {
    const settings = await perform<Omit<MessagingView, 'messages' | 'defaults'>>(
      'messages_settings',
      {},
    );
    if (!settings.ok) return null;
    const messages = await perform<Message[]>('messages_list', { limit: 30 });
    return {
      ...settings.output,
      defaults: defaultTemplates(getLocale() === 'en' ? 'en' : 'fr'),
      messages: messages.ok ? messages.output : [],
    };
  },
);

export const fetchOrderMessages = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ orderId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const read = await perform<Message[]>('messages_list', { ...data, limit: 20 });
    return read.ok ? read.output : [];
  });

export const fetchTelegramLink = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ customerId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const read = await perform<{ link: string | null }>('messages_telegram_link', data);
    return read.ok ? read.output.link : null;
  });

export const saveTemplate = createServerFn({ method: 'POST' })
  .validator((input: unknown) => templateInput.parse(input))
  .handler(({ data }) => perform<{ kind: MessageKind }>('messages_set_template', data));

export const resendMessage = createServerFn({ method: 'POST' })
  .validator((input: unknown) => resendInput.parse(input))
  .handler(({ data }) => perform<{ messageId: string }>('messages_resend', data));

export const remindSleeping = createServerFn({ method: 'POST' }).handler(() =>
  perform<{ queued: number; notSent: number }>('messages_remind', {}),
);
