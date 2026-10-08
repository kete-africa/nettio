import { RuleError } from '@/lib/rule-error';

// The laundry's messages to its customers (docs/product/model.md, « Les messages »;
// docs/product/voix.md), pure: what a template may say, how it is filled, and whether a message
// may leave. Nothing leaves unless the laundry decided it, and the customer agreed.

export const messageKinds = ['receipt', 'ready', 'reminder'] as const;
export type MessageKind = (typeof messageKinds)[number];

/** What a template may name. The words are the laundry's; the values are computed by code. */
export const placeholders = [
  'client',
  'numero',
  'contenu',
  'total',
  'paye',
  'reste',
  'date',
  'pressing',
] as const;
export type Placeholder = (typeof placeholders)[number];

const pattern = /\{([a-zA-Z_]+)\}/g;

/** The placeholders of a template that Nettio does not know. */
export function unknownPlaceholders(body: string): string[] {
  const known = new Set<string>(placeholders);
  return [...new Set([...body.matchAll(pattern)].map((match) => match[1] ?? ''))].filter(
    (name) => !known.has(name),
  );
}

export function checkTemplate(body: string): void {
  if (!body.trim()) throw new RuleError('template_empty');
  const unknown = unknownPlaceholders(body);
  if (unknown.length > 0) throw new RuleError('template_unknown_placeholder', { name: unknown[0] ?? '' });
}

/** Fills a template with the values of a deposit. */
export function renderTemplate(body: string, values: Record<Placeholder, string>): string {
  return body.replace(pattern, (whole, name: string) =>
    name in values ? values[name as Placeholder] : whole,
  );
}

/** An amount as a message says it: 5 400 F CFA, with plain spaces. */
export function sayMoney(amount: number): string {
  return `${new Intl.NumberFormat('fr-FR').format(Math.round(amount)).replace(/[  ]/g, ' ')} F CFA`;
}

/** A day and an hour as a message says them: samedi 10 octobre à 17:00. */
export function sayDate(date: Date): string {
  const day = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Africa/Lome',
  }).format(date);
  const hour = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lome',
  }).format(date);
  return `${day} à ${hour}`;
}

export type CustomerChannelChoice = 'whatsapp' | 'telegram' | 'sms' | 'none';

export type Route =
  | { send: true; channel: 'whatsapp' | 'telegram'; to: string }
  | {
      send: false;
      reason: 'no_consent' | 'no_channel' | 'sms_not_connected' | 'telegram_not_linked';
    };

/**
 * Where a message for a customer goes — or why it does not leave. WhatsApp reaches her by her
 * phone; Telegram only once she opened the laundry's bot (a bot cannot write first).
 */
export function routeFor(customer: {
  phone: string;
  channel: CustomerChannelChoice;
  consent: boolean;
  telegramChatId: string | null;
}): Route {
  if (!customer.consent) return { send: false, reason: 'no_consent' };
  if (customer.channel === 'none') return { send: false, reason: 'no_channel' };
  if (customer.channel === 'sms') return { send: false, reason: 'sms_not_connected' };
  if (customer.channel === 'telegram') {
    return customer.telegramChatId
      ? { send: true, channel: 'telegram', to: customer.telegramChatId }
      : { send: false, reason: 'telegram_not_linked' };
  }
  return { send: true, channel: 'whatsapp', to: customer.phone.replace(/\D/g, '') };
}

/** What a customer who writes to the laundry wants. */
export type Intent = { kind: 'stop' } | { kind: 'link'; token: string } | { kind: 'status' };

export function intentOf(text: string): Intent {
  const said = text.trim();
  if (/^(stop|arr[eê]t(er|ez)?|d[ée]sabonner)\b/i.test(said)) return { kind: 'stop' };
  const start = /^\/start\s+([A-Za-z0-9_-]{8,64})$/.exec(said);
  if (start?.[1]) return { kind: 'link', token: start[1] };
  return { kind: 'status' };
}

/** Whether a reminder may leave for a deposit: it sleeps, and was not chased too recently. */
export function mayRemind(input: {
  readyAt: Date;
  lastRemindedAt: Date | null;
  now: Date;
  dormantDays: number;
  reminderDays: number;
}): boolean {
  const day = 86_400_000;
  if (input.now.getTime() - input.readyAt.getTime() < input.dormantDays * day) return false;
  if (!input.lastRemindedAt) return true;
  return input.now.getTime() - input.lastRemindedAt.getTime() >= input.reminderDays * day;
}
