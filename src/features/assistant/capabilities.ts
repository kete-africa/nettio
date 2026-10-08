import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { getChannels, telegramBotName } from '@/platform/channels';
import { emailIsConnected } from '@/platform/statement';
import { sendStatementNow, setStatementDelivery } from './commands';
import { deliveryInput, sendNowInput } from './delivery.record';
import { readDelivery, statementTokenOf } from './infrastructure/delivery.tables';
import { statementOf } from './sending';

/**
 * What Nettio says by itself. The day's statement is computed by code and worded with fixed
 * sentences: a copilot reads it as it is, and has nothing to compute. Where it leaves to in the
 * evening is the owner's decision: an agent prepares it (level 3), a person decides.
 */
export const assistantCapabilities = [
  defineCapability({
    name: 'day_statement',
    description:
      'The statement of a day (today by default), ready to read: what was cashed, deposits and pieces received, what is ready, late or sleeping, what customers owe, the tills and their gaps, open incidents, and the month so far with what the owner took. Figures computed by code; quote it as it is.',
    permission: 'money:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({
      day: z.iso.date().optional(),
      language: z.enum(['fr', 'en']).default('fr'),
    }),
    run: (input, { db }) => statementOf(db, input),
  }),
  defineCapability({
    name: 'statement_delivery',
    description:
      'Whether the laundry’s statement leaves by itself in the evening, at what hour (universal time), where to (e-mail, WhatsApp, Telegram), what its last sending became on each channel, and whether each channel is connected.',
    permission: 'statement:send',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({}),
    async run(_input, { db, organizationId }) {
      const delivery = await readDelivery(db);
      const channels = getChannels();
      const bot = telegramBotName();
      return {
        delivery,
        connected: {
          email: emailIsConnected(),
          whatsapp: channels.whatsapp !== null,
          telegram: channels.telegram !== null,
        },
        // The link the owner opens once, on her own Telegram, to receive the statement there.
        telegramLink:
          bot && !delivery.telegramLinked
            ? `https://t.me/${bot}?start=${await statementTokenOf(db, organizationId)}`
            : null,
      };
    },
  }),
  defineCapability({
    name: 'statement_set_delivery',
    description:
      'Turns the evening statement on or off, and sets its hour (0–23, universal time), its language, and where it leaves to: an e-mail address, a WhatsApp number. Whoever receives it reads the laundry’s money.',
    permission: 'statement:send',
    autonomy: 3,
    input: deliveryInput,
    command: setStatementDelivery,
    draft: { recordType: 'statement_delivery' },
  }),
  defineCapability({
    name: 'statement_send_now',
    description:
      'Sends today’s statement now to where the laundry decided, to check that it arrives. Returns what it became on each channel.',
    permission: 'statement:send',
    autonomy: 3,
    input: sendNowInput,
    command: sendStatementNow,
    draft: { recordType: 'statement_sending' },
  }),
];
