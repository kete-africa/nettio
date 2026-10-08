import { linkStatementChat, organizationOfStatementToken, STATEMENT_TOKEN } from '@/features/assistant';
import { deliver, hear, replyWords } from '@/features/messaging';
import * as m from '@/paraglide/messages.js';
import { getChannels } from './channels';
import { getPool, transaction } from './db';
import { parseUpdate, secretIsValid } from './telegram';
import { parseNotification, signatureIsValid, verifySubscription } from './whatsapp';

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

async function heard(channel: 'whatsapp' | 'telegram', messages: { sender: string; text: string }[]) {
  for (const message of messages) {
    if (channel === 'telegram' && (await statementLinked(message.sender, message.text))) continue;
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
  return token ? verifySubscription(new URL(request.url), token) : notConnected();
}

/** A WhatsApp notification: refused unless Meta signed it with the app secret. */
export async function whatsappWebhook(request: Request): Promise<Response> {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return notConnected();
  const raw = await request.text();
  if (!signatureIsValid(raw, request.headers.get('x-hub-signature-256'), secret)) {
    return new Response(null, { status: 401 });
  }
  await heard('whatsapp', parseNotification(JSON.parse(raw)));
  return new Response(null, { status: 200 });
}

/** A Telegram update: refused unless it carries the secret token given to Telegram. */
export async function telegramWebhook(request: Request): Promise<Response> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) return notConnected();
  if (!secretIsValid(request.headers.get('x-telegram-bot-api-secret-token'), secret)) {
    return new Response(null, { status: 401 });
  }
  await heard('telegram', parseUpdate(await request.json()));
  return new Response(null, { status: 200 });
}
