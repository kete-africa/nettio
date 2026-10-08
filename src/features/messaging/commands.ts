import { defineCommand } from '@kete/commands';
import { readSettings } from '@/features/business';
import { RuleError } from '@/lib/rule-error';
import { askDelivery } from '@/platform/channels';
import { checkTemplate, mayRemind } from './domain/messages';
import {
  listTemplates,
  queueOrderMessage,
  requeue,
  saveTemplate,
  sleepingOrders,
} from './infrastructure/outbox';
import { remindInput, resendInput, templateInput } from './message.record';

/** A ready deposit is chased again after this many days at the soonest. */
export const REMINDER_DAYS = 7;

/**
 * Sets what the laundry decided for a kind of message: on or off, and its own words. Nothing
 * leaves for its customers unless it turned the kind on (constitution III).
 */
export const setMessageTemplate = defineCommand({
  name: 'set-message-template',
  input: templateInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    checkTemplate(input.body);
    await saveTemplate(db, organizationId, input);
    return { kind: input.kind, enabled: input.enabled };
  },
  summarize: (input) => `Message « ${input.kind} » turned ${input.enabled ? 'on' : 'off'}`,
});

/** Puts a message that failed back in the queue. */
export const resendMessage = defineCommand({
  name: 'resend-message',
  input: resendInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (!(await requeue(db, input.messageId))) throw new RuleError('not_found');
    askDelivery(organizationId);
    return { messageId: input.messageId };
  },
  summarize: () => 'A message queued again',
});

/**
 * Chases the ready deposits that sleep: one reminder each, at most once in the reminder delay. The
 * laundry's gesture — Nettio never chases its customers on its own.
 */
export const remindSleepingOrders = defineCommand({
  name: 'remind-sleeping-orders',
  input: remindInput,
  reversibility: { reversible: false },
  async handler(_input, { db, organizationId }) {
    const settings = await readSettings(db);
    if (!settings) throw new RuleError('not_set_up');
    const template = (await listTemplates(db)).find((t) => t.kind === 'reminder');
    if (!template?.enabled) throw new RuleError('reminder_not_enabled');
    const now = new Date();
    let queued = 0;
    let considered = 0;
    for (const order of await sleepingOrders(db)) {
      if (
        !mayRemind({
          readyAt: order.readyAt,
          lastRemindedAt: order.lastRemindedAt,
          now,
          dormantDays: settings.dormantDays,
          reminderDays: REMINDER_DAYS,
        })
      ) {
        continue;
      }
      considered += 1;
      if (await queueOrderMessage(db, organizationId, { orderId: order.orderId, kind: 'reminder' })) {
        queued += 1;
      }
    }
    if (queued > 0) askDelivery(organizationId);
    return { queued, notSent: considered - queued };
  },
  summarize: (_input, output) => `${output.queued} reminder(s) queued`,
});
