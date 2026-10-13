import {
  heardFromStaff,
  linkStatementChat,
  organizationOfStatementToken,
  STATEMENT_TOKEN,
} from '@/features/assistant';
import { deliver, hear, replyWords } from '@/features/messaging';
import * as m from '@/paraglide/messages.js';
import { getChannels } from './channels';
import { getPool, transaction } from './db';
import { decisionHeard } from './decisions';
import { asStaff } from './rights';
import {
  parseTelegramUpdate,
  parseWhatsAppNotification,
  telegramSecretIsValid,
  verifyWhatsAppSubscription,
  whatsAppSignatureIsValid,
  type ChatInbound,
} from '@kete/notify';

// The webhooks of the messaging channels: each call is authenticated before anything is read,
// then what a customer wrote is heard, and the answer leaves at once.

/**
 * The owner opened the link of her evening statement on Telegram: her chat is tied to her
 * laundry's statement, and she is told so. The link works once.
 */
async function statementLinked(sender: string, text: string): Promise<boolean> {
  const token = /^\/start\s+([A-Za-z0-9_-]{8,64})$/.exec(text.trim())?.[1];
  if (!token?.startsWith(STATEMENT_TOKEN)) return false;
  const organizationId = await organizationOfStatementToken(getPool(), token);
  if (!organizationId) return true;
  const linked = await transaction(organizationId, (db) => linkStatementChat(db, token, sender));
  if (linked) await getChannels().telegram?.sendText(sender, m.statement_linked({}, { locale: 'fr' }));
  return true;
}

/**
 * What a customer or a member of the team wrote, as Nettio hears it: the texts only. WhatsApp names
 * a phone by its digits when the provider gives it; a person who hides her number is named by the
 * provider's own identifier, which no customer nor colleague is known by yet — she is answered like
 * any unknown sender. Telegram names a chat.
 */
function texts(inbound: ChatInbound[]): { sender: string; text: string }[] {
  return inbound
    .filter((message) => message.kind === 'text')
    .map((message) => ({
      sender:
        message.channel === 'whatsapp'
          ? (message.sender.phone?.replace(/\D/g, '') ?? message.sender.id)
          : message.sender.address,
      text: message.text ?? '',
    }));
}

async function heard(channel: 'whatsapp' | 'telegram', inbound: ChatInbound[]) {
  for (const message of texts(inbound)) {
    if (channel === 'telegram' && (await statementLinked(message.sender, message.text))) continue;
    const sender = message.sender;
    // A manager's « OUI 12 » on a request that waits for her (specs/025-manager).
    if (await decisionHeard({ channel, sender, text: message.text })) continue;
    const fromTeam = await heardFromStaff(
      { channel, sender, text: message.text },
      {
        lookup: getPool(),
        inOrganization: transaction,
        asStaff,
        reply: async (text) => {
          await getChannels()[channel]?.sendText(sender, text);
        },
        words: {
          tied: () => m.ask_link_tied({}, { locale: 'fr' }),
          untied: () => m.ask_link_untied({}, { locale: 'fr' }),
          notConnected: () => m.ask_not_connected_body({}, { locale: 'fr' }),
          budgetSpent: () => m.ask_budget_spent({}, { locale: 'fr' }),
          notAllowed: () => m.error_not_allowed({}, { locale: 'fr' }),
        },
      },
    );
    if (fromTeam) continue;
    const organizations = await hear(
      { channel, ...message },
      { lookup: getPool(), inOrganization: transaction, words: replyWords() },
    );
    for (const organizationId of new Set(organizations)) {
      await transaction(organizationId, (db) => deliver(db, getChannels()));
    }
  }
}

const notConnected = () => new Response(null, { status: 404 });

/** Meta's subscription check. */
export function whatsappSubscription(request: Request): Response {
  const token = process.env.WHATSAPP_VERIFY_TOKEN;
  return token ? verifyWhatsAppSubscription(new URL(request.url), token) : notConnected();
}

/** A WhatsApp notification: refused unless Meta signed it with the app secret. */
export async function whatsappWebhook(request: Request): Promise<Response> {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return notConnected();
  const raw = await request.text();
  if (!whatsAppSignatureIsValid(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return new Response(null, { status: 401 });
  }
  await heard('whatsapp', parseWhatsAppNotification(JSON.parse(raw)));
  return new Response(null, { status: 200 });
}

/** A Telegram update: refused unless it carries the secret token given to Telegram. */
export async function telegramWebhook(request: Request): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return notConnected();
  if (!telegramSecretIsValid(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return new Response(null, { status: 401 });
  }
  await heard('telegram', parseTelegramUpdate(await request.json()));
  return new Response(null, { status: 200 });
}
