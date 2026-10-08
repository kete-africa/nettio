import { timingSafeEqual } from 'node:crypto';
import { ChannelError, type CustomerChannel } from '@/features/messaging/ports';

/**
 * The Telegram adapter (Bot API), written from Firmo's. The webhook is authenticated by the secret
 * token Telegram echoes in X-Telegram-Bot-Api-Secret-Token; only private chats are accepted, so
 * the chat is the sender. A bot cannot write first: a customer opens it from the link of her
 * receipt.
 */
export interface TelegramOptions {
  botToken: string;
  fetch?: typeof fetch;
}

export function secretIsValid(header: string | null, secret: string): boolean {
  if (!header) return false;
  const left = Buffer.from(header);
  const right = Buffer.from(secret);
  return left.length === right.length && timingSafeEqual(left, right);
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => (value && typeof value === 'object' ? (value as Json) : {});

/** The text of a verified update; anything but a text in a private chat is ignored. */
export function parseUpdate(body: unknown): { sender: string; text: string }[] {
  const message = record(record(body).message);
  const from = record(message.from);
  const chat = record(message.chat);
  if (!message.message_id || chat.type !== 'private' || String(chat.id) !== String(from.id)) return [];
  if (typeof message.text !== 'string') return [];
  return [{ sender: String(chat.id), text: message.text }];
}

export function telegramChannel(options: TelegramOptions): CustomerChannel {
  const http = options.fetch ?? fetch;
  const api = `https://api.telegram.org/bot${options.botToken}`;

  async function call(method: string, payload: Json): Promise<void> {
    let response: Response;
    try {
      response = await http(`${api}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch {
      throw new ChannelError('network');
    }
    const body = record(await response.json().catch(() => ({})));
    if (response.ok && body.ok === true) return;
    // 403: the person blocked the bot, or never opened it.
    throw new ChannelError(
      response.status === 403 ? 'recipient_unreachable' : 'provider_refused',
      `telegram ${method} ${response.status}`,
    );
  }

  return {
    channel: 'telegram',
    sendText: (to, text) => call('sendMessage', { chat_id: to, text }),
    async sendDocument() {
      throw new ChannelError('provider_refused', 'documents are not sent by Nettio yet');
    },
  };
}
