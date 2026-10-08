import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { getChannels, telegramBotName } from '@/platform/channels';
import { remindSleepingOrders, resendMessage, setMessageTemplate } from './commands';
import { messageKinds, placeholders } from './domain/messages';
import { linkTokenOf, listMessages, listTemplates } from './infrastructure/outbox';
import { remindInput, resendInput, templateInput } from './message.record';

/**
 * What a screen, a copilot or an agent may do with the laundry's messages. An agent never writes
 * to the laundry's customers alone: it prepares a template or a reminder round (level 3), and a
 * person decides.
 */
export const messagingCapabilities = [
  defineCapability({
    name: 'messages_settings',
    description:
      'What the laundry decided for each kind of message to its customers (receipt, ready, reminder): on or off, its words, the placeholders they may use — and whether each channel (WhatsApp, Telegram) is connected.',
    permission: 'messages:read',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db }) {
      const stored = await listTemplates(db);
      const channels = getChannels();
      return {
        templates: messageKinds.map(
          (kind) =>
            stored.find((template) => template.kind === kind) ?? {
              kind,
              enabled: false,
              body: '',
              providerTemplate: '',
            },
        ),
        placeholders: [...placeholders],
        channels: {
          whatsapp: channels.whatsapp !== null,
          telegram: channels.telegram !== null,
        },
      };
    },
  }),
  defineCapability({
    name: 'messages_list',
    description:
      'The messages to and from the laundry’s customers, the latest first, or those of one deposit: kind, channel, words, whether sent, waiting, failed or not sent — and why.',
    permission: 'messages:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({
      orderId: z.string().max(64).optional(),
      limit: z.number().int().min(1).max(200).default(50),
    }),
    run: (input, { db }) => listMessages(db, input),
  }),
  defineCapability({
    name: 'messages_telegram_link',
    description:
      'The link a customer opens to receive the messages of her deposits on Telegram; null while Telegram is not connected.',
    permission: 'messages:read',
    autonomy: 1,
    input: z.object({ customerId: z.string().min(1).max(64) }),
    async run(input, { db }) {
      const bot = telegramBotName();
      if (!bot) return { link: null };
      return { link: `https://t.me/${bot}?start=${await linkTokenOf(db, input.customerId)}` };
    },
  }),
  defineCapability({
    name: 'messages_set_template',
    description:
      'Turns a kind of message on or off and sets the laundry’s words for it. Placeholders: {client} {numero} {contenu} {total} {paye} {reste} {date} {pressing}.',
    permission: 'messages:manage',
    autonomy: 3,
    input: templateInput,
    command: setMessageTemplate,
    draft: { recordType: 'message_template' },
  }),
  defineCapability({
    name: 'messages_resend',
    description: 'Puts a message that failed back in the queue.',
    permission: 'messages:manage',
    autonomy: 3,
    input: resendInput,
    command: resendMessage,
    draft: { recordType: 'message_resend' },
  }),
  defineCapability({
    name: 'messages_remind',
    description:
      'Chases the ready deposits that sleep: one reminder each, at most once a week. The laundry’s decision.',
    permission: 'messages:manage',
    autonomy: 3,
    input: remindInput,
    command: remindSleepingOrders,
    draft: { recordType: 'reminder_round' },
  }),
];
