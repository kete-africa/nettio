import type { SqlExecutor } from '@kete/tenancy';
import { intentOf, sayDate, sayMoney } from './domain/messages';
import {
  businessNameOf,
  customerOfToken,
  customersOfSender,
  linkTelegram,
  markMessage,
  noteExchange,
  openOrdersOf,
  takeQueued,
  withdrawConsent,
} from './infrastructure/outbox';
import { ChannelError, type Channels } from './ports';

/** What a transaction of an organization is, for the messaging feature. */
export type InOrganization = <T>(
  organizationId: string,
  work: (db: SqlExecutor) => Promise<T>,
) => Promise<T>;

/**
 * Sends what waits for an organization, through the channel of each message. A channel that is
 * not connected leaves its messages waiting; a refusal keeps its reason. Returns what happened.
 */
export async function deliver(
  db: SqlExecutor,
  channels: Channels,
): Promise<{ sent: number; failed: number; waiting: number }> {
  const result = { sent: 0, failed: 0, waiting: 0 };
  for (const message of await takeQueued(db, 50)) {
    const channel = channels[message.channel];
    if (!channel) {
      result.waiting += 1;
      continue;
    }
    try {
      if (message.providerTemplate && channel.sendTemplate) {
        await channel.sendTemplate(message.recipient, {
          name: message.providerTemplate,
          language: 'fr',
          parameters: message.parameters,
        });
      } else {
        await channel.sendText(message.recipient, message.body);
      }
      await markMessage(db, message.messageId, { status: 'sent' });
      result.sent += 1;
    } catch (error) {
      const reason = error instanceof ChannelError ? error.reason : 'network';
      await markMessage(db, message.messageId, { status: 'failed', reason });
      result.failed += 1;
    }
  }
  return result;
}

/** The words Nettio answers with, in the laundry's name: supplied by the application layer. */
export interface ReplyWords {
  stopped(business: string): string;
  linked(business: string): string;
  none(business: string): string;
  inProgress(order: { number: string; date: string }): string;
  ready(order: { number: string; balance: string }): string;
  readyPaid(order: { number: string }): string;
  signature(business: string): string;
}

/**
 * A customer wrote to the laundry: « stop » withdraws her consent, the link of her receipt ties
 * her Telegram chat, anything else is answered with the state of her open deposits — computed,
 * never invented. An unknown sender gets no answer. Returns the organizations that have a reply
 * to send.
 */
export async function hear(
  input: {
    channel: 'whatsapp' | 'telegram';
    /** The phone's digits (WhatsApp), or the chat (Telegram). */
    sender: string;
    text: string;
  },
  deps: { lookup: SqlExecutor; inOrganization: InOrganization; words: ReplyWords },
): Promise<string[]> {
  const intent = intentOf(input.text);
  const { words } = deps;
  if (intent.kind === 'link') {
    if (input.channel !== 'telegram') return [];
    const owner = await customerOfToken(deps.lookup, intent.token);
    if (!owner) return [];
    await deps.inOrganization(owner.organizationId, async (db) => {
      await linkTelegram(db, owner.customerId, input.sender);
      await noteExchange(db, owner.organizationId, {
        customerId: owner.customerId,
        channel: 'telegram',
        recipient: input.sender,
        heard: '/start',
        answer: words.linked(await businessNameOf(db)),
      });
    });
    return [owner.organizationId];
  }
  const customers = await customersOfSender(
    deps.lookup,
    input.channel === 'whatsapp'
      ? { channel: 'whatsapp', phone: `+${input.sender.replace(/\D/g, '')}` }
      : { channel: 'telegram', chatId: input.sender },
  );
  for (const { organizationId, customerId } of customers) {
    await deps.inOrganization(organizationId, async (db) => {
      const business = await businessNameOf(db);
      let answer: string;
      if (intent.kind === 'stop') {
        await withdrawConsent(db, customerId);
        answer = words.stopped(business);
      } else {
        const orders = await openOrdersOf(db, customerId);
        answer =
          orders.length === 0
            ? words.none(business)
            : [
                ...orders.map((order) =>
                  order.status === 'ready'
                    ? order.balance > 0
                      ? words.ready({ number: order.number, balance: sayMoney(order.balance) })
                      : words.readyPaid({ number: order.number })
                    : words.inProgress({ number: order.number, date: sayDate(order.promisedAt) }),
                ),
                words.signature(business),
              ].join('\n');
      }
      await noteExchange(db, organizationId, {
        customerId,
        channel: input.channel,
        recipient: input.sender,
        heard: input.text,
        answer,
      });
    });
  }
  return customers.map((customer) => customer.organizationId);
}
