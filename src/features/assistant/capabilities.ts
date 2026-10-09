import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { readSettings } from '@/features/business';
import { monthFigures } from '@/features/money';
import { listSessions } from '@/features/money/infrastructure/money.tables';
import { dayBounds } from '@/features/orders';
import { daySummary } from '@/features/orders/infrastructure/orders.tables';
import { listIncidents } from '@/features/workshop/infrastructure/units';
import { RuleError } from '@/lib/rule-error';
import { getChannels, telegramBotName } from '@/platform/channels';
import { holds } from '@/platform/rights';
import { emailIsConnected } from '@/platform/statement';
import { sendStatementNow, setStatementDelivery, untieMyMessaging } from './commands';
import { deliveryInput, sendNowInput } from './delivery.record';
import { alertsOf, type AlertFacts } from './domain/alerts';
import { orderWarnings } from './infrastructure/alerts';
import { readDelivery, statementTokenOf } from './infrastructure/delivery.tables';
import { messagingTokenOf, readMessagingLink } from './infrastructure/messaging-link.tables';
import { personBehind } from '@/lib/actor';
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
    name: 'alerts_read',
    description:
      'What deserves a look today, computed by code: deposits late or due within 24 hours, ready deposits that sleep, tills closed today with a gap, today’s discounts above the laundry’s ceiling, deposits of the month sold under their variable cost, open workshop incidents. Only what the person may read; an empty list means nothing to signal.',
    permission: 'orders:read',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db }) {
      const settings = await readSettings(db);
      if (!settings) throw new RuleError('not_set_up');
      const bounds = dayBounds();
      const summary = await daySummary(db, { ...bounds, dormantDays: settings.dormantDays });
      const warnings = await orderWarnings(db, { ...bounds, ceilingPercent: settings.discountCeilingPercent });
      const facts: AlertFacts = {
        late: summary.late,
        dormant: summary.dormant,
        dueSoon: warnings.dueSoon,
        discountsOverCeiling: warnings.discountsOverCeiling,
        openIncidents: (await listIncidents(db, { openOnly: true })).length,
      };
      // The money's alerts are for who reads the money.
      if (holds('money:read')) {
        const tills = await listSessions(db, { limit: 50 });
        facts.tillGaps = tills
          .filter((till) => till.closedAt && till.closedAt >= bounds.from && till.closedAt < bounds.to)
          .map((till) => till.gap ?? 0);
        const day = bounds.from.toISOString().slice(0, 10);
        facts.belowCost = (await monthFigures(db, day.slice(0, 7))).content.belowCost;
      }
      return { alerts: alertsOf(facts) };
    },
  }),
  defineCapability({
    name: 'assistant_messaging',
    description:
      'Whether the person tied her own WhatsApp or Telegram to ask Nettio from there, the token she sends to tie it, and whether each channel is connected.',
    permission: 'assistant:ask',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db, organizationId, actor }) {
      const me = personBehind(actor);
      const channels = getChannels();
      const bot = telegramBotName();
      const token = await messagingTokenOf(db, organizationId, me);
      return {
        link: await readMessagingLink(db, me),
        token,
        telegramLink: bot ? `https://t.me/${bot}?start=${token}` : null,
        connected: { whatsapp: channels.whatsapp !== null, telegram: channels.telegram !== null },
      };
    },
  }),
  defineCapability({
    name: 'assistant_untie_messaging',
    description: 'Forgets the WhatsApp and the Telegram the person tied to ask Nettio from there.',
    permission: 'assistant:ask',
    autonomy: 3,
    input: z.object({}),
    command: untieMyMessaging,
    draft: { recordType: 'messaging_link' },
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
