import type { Channels } from '@/features/messaging/ports';
import { telegramChannel } from './telegram';
import { whatsappChannel } from './whatsapp';

let channels: Channels | undefined;

/**
 * The channels of this deployment (docs/decisions/0004): one sender per channel, from the
 * environment. Without its variables a channel is not connected — its messages wait, and the
 * screens say so. Nothing is simulated.
 */
export function getChannels(): Channels {
  const whatsapp = process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID;
  const telegram = process.env.TELEGRAM_BOT_TOKEN;
  channels ??= {
    whatsapp: whatsapp
      ? whatsappChannel({
          accessToken: process.env.WHATSAPP_ACCESS_TOKEN ?? '',
          phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? '',
        })
      : null,
    telegram: telegram ? telegramChannel({ botToken: telegram }) : null,
  };
  return channels;
}

/** Tests: other channels (recorded exchanges, never the live services). */
export function useChannels(next: Channels | undefined): void {
  channels = next;
}

/** The public name of the laundry's Telegram bot, for the link of a receipt; null when not connected. */
export const telegramBotName = (): string | null =>
  process.env.TELEGRAM_BOT_TOKEN ? (process.env.TELEGRAM_BOT_USERNAME ?? null) : null;

let kick: ((organizationId: string) => void) | undefined;

/** The web process says how a delivery is asked for (a job for the worker); tests ask for none. */
export function onDeliveryAsked(handler: (organizationId: string) => void): void {
  kick = handler;
}

/** Asks for the delivery of what waits for an organization; never fails the gesture that asked. */
export function askDelivery(organizationId: string): void {
  try {
    kick?.(organizationId);
  } catch {
    // The message waits in its table: the next delivery takes it.
  }
}
