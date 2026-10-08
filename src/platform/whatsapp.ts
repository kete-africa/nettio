import { createHmac, timingSafeEqual } from 'node:crypto';
import { ChannelError, type CustomerChannel } from '@/features/messaging/ports';

/**
 * The WhatsApp adapter (Meta Cloud API), written from Firmo's. The webhook is authenticated by
 * Meta's signature over the raw body (X-Hub-Signature-256, the app secret); the sender is Meta's
 * `from`, the person's number.
 */
export interface WhatsAppOptions {
  accessToken: string;
  phoneNumberId: string;
  graphVersion?: string;
  fetch?: typeof fetch;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Meta's subscription check: echoes the challenge only for our verify token. */
export function verifySubscription(url: URL, verifyToken: string): Response {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token') ?? '';
  const challenge = url.searchParams.get('hub.challenge') ?? '';
  if (mode === 'subscribe' && safeEqual(token, verifyToken)) return new Response(challenge);
  return new Response(null, { status: 403 });
}

export function signatureIsValid(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')}`;
  return safeEqual(expected, header);
}

type Json = Record<string, unknown>;
const record = (value: unknown): Json => (value && typeof value === 'object' ? (value as Json) : {});
const list = (value: unknown): Json[] => (Array.isArray(value) ? (value as Json[]) : []);

/** The texts of a verified notification; statuses, media and unknown events are ignored. */
export function parseNotification(body: unknown): { sender: string; text: string }[] {
  const heard: { sender: string; text: string }[] = [];
  for (const entry of list(record(body).entry)) {
    for (const change of list(entry.changes)) {
      for (const message of list(record(change.value).messages)) {
        const sender = String(message.from ?? '');
        if (!sender || String(message.type) !== 'text') continue;
        heard.push({ sender, text: String(record(message.text).body ?? '') });
      }
    }
  }
  return heard;
}

/** Why Meta refused: 131047 is a business writing first outside the 24-hour window. */
function refusal(status: number, body: Json): ChannelError {
  const code = Number(record(body.error).code ?? 0);
  if (code === 131047) return new ChannelError('outside_window', `whatsapp ${code}`);
  if (code === 131026 || code === 131030) return new ChannelError('recipient_unreachable', `whatsapp ${code}`);
  return new ChannelError('provider_refused', `whatsapp ${status} ${code}`);
}

export function whatsappChannel(options: WhatsAppOptions): CustomerChannel {
  const http = options.fetch ?? fetch;
  const graph = `https://graph.facebook.com/${options.graphVersion ?? 'v25.0'}`;

  async function send(payload: Json): Promise<void> {
    let response: Response;
    try {
      response = await http(`${graph}/${options.phoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${options.accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ messaging_product: 'whatsapp', recipient_type: 'individual', ...payload }),
      });
    } catch {
      throw new ChannelError('network');
    }
    if (!response.ok) throw refusal(response.status, record(await response.json().catch(() => ({}))));
  }

  return {
    channel: 'whatsapp',
    sendText: (to, text) => send({ to, type: 'text', text: { body: text, preview_url: false } }),
    // A message a business sends first must be an approved template; its body takes the values in order.
    sendTemplate: (to, template) =>
      send({
        to,
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language },
          components: [
            {
              type: 'body',
              parameters: template.parameters.map((text) => ({ type: 'text', text })),
            },
          ],
        },
      }),
    async sendDocument() {
      throw new ChannelError('provider_refused', 'documents are not sent by Nettio yet');
    },
  };
}
