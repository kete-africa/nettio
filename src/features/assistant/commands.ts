import { defineCommand } from '@kete/commands';
import { readSettings } from '@/features/business';
import { normalizePhone } from '@/features/customers';
import { RuleError } from '@/lib/rule-error';
import { sendingPorts } from '@/platform/statement';
import { deliveryInput, sendNowInput } from './delivery.record';
import { destinationsOf } from './domain/sending';
import { readDelivery, saveDelivery } from './infrastructure/delivery.tables';
import { sendStatement } from './sending';

/**
 * Sets whether the laundry's statement leaves by itself in the evening, at what hour, and where
 * to. Whoever receives it reads the laundry's money: this is the owner's decision.
 */
export const setStatementDelivery = defineCommand({
  name: 'set-statement-delivery',
  input: deliveryInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const settings = await readSettings(db);
    if (!settings) throw new RuleError('not_set_up');
    const before = await readDelivery(db);
    const whatsapp = input.whatsapp === '' ? '' : normalizePhone(input.whatsapp, settings.phonePrefix);
    const choice = {
      enabled: input.enabled,
      hour: input.hour,
      email: input.email,
      whatsapp,
      telegramLinked: before.telegramLinked && !input.unlinkTelegram,
    };
    // Turned on with nowhere to go, it would be believed to leave.
    if (input.enabled && destinationsOf(choice).length === 0) {
      throw new RuleError('statement_no_destination');
    }
    await saveDelivery(db, organizationId, {
      enabled: input.enabled,
      hour: input.hour,
      language: input.language,
      email: input.email,
      whatsapp,
      unlinkTelegram: input.unlinkTelegram,
    });
    return { enabled: input.enabled, hour: input.hour, destinations: destinationsOf(choice) };
  },
  summarize: (input, output) =>
    input.enabled
      ? `Evening statement on, at ${input.hour} h, to ${output.destinations.join(', ')}`
      : 'Evening statement off',
});

/**
 * Sends today's statement now, to where the laundry decided — to check that it arrives. It does
 * not count as the evening's sending.
 */
export const sendStatementNow = defineCommand({
  name: 'send-statement-now',
  input: sendNowInput,
  reversibility: { reversible: false },
  async handler(_input, { db }) {
    const delivery = await readDelivery(db);
    if (destinationsOf(delivery).length === 0) throw new RuleError('statement_no_destination');
    return { outcome: await sendStatement(db, await sendingPorts()) };
  },
  summarize: (_input, output) =>
    `Statement sent now: ${output.outcome.map((o) => `${o.channel} ${o.status}`).join(', ')}`,
});
