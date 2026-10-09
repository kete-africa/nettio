import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getLocale } from '@/paraglide/runtime.js';
import { transcribe, NoTranscriptGeneratedError } from 'ai';
import { getBudgets, getModel, getTranscriber } from '@/platform/ai';
import { holds } from '@/platform/rights';
import { perform, signedIn } from '@/platform/screen';
import { askNettio, ASSISTANT, type AskOutcome } from './ask';
import { deliveryInput } from './delivery.record';
import type { Alert } from './domain/alerts';
import type { SendingOutcome } from './domain/sending';
import type { StatementDelivery } from './infrastructure/delivery.tables';

export interface Statement {
  day: string;
  business: string;
  lines: string[];
}

/** The day's statement, for whoever reads the money; null otherwise. */
export const fetchStatement = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<Statement>('day_statement', {
    language: getLocale() === 'en' ? 'en' : 'fr',
  });
  return read.ok ? read.output : null;
});

/** Whether « Demander » can answer here: a model is connected, and the person may ask. */
export const fetchAsking = createServerFn({ method: 'GET' }).handler(async () => {
  const { as } = await signedIn();
  return as(() => ({
    allowed: holds('assistant:ask'),
    connected: getModel() !== null,
    voice: getModel() !== null && getTranscriber() !== null,
  }));
});

export const askQuestion = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        question: z.string().trim().min(2).max(500),
        screen: z.string().max(120).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<AskOutcome | { available: false; reason: 'not_allowed' }> => {
    const { identity, caller, as } = await signedIn();
    return as(async () => {
      if (!holds('assistant:ask')) return { available: false as const, reason: 'not_allowed' as const };
      return askNettio(
        { userId: identity.userId, organizationId: caller.organizationId },
        data.question,
        data.screen,
      );
    });
  });

export interface DeliveryView {
  delivery: StatementDelivery;
  connected: { email: boolean; whatsapp: boolean; telegram: boolean };
  telegramLink: string | null;
}

/** Where the evening statement leaves to, for whoever decides it; null otherwise. */
export const fetchDelivery = createServerFn({ method: 'GET' }).handler(
  async (): Promise<DeliveryView | null> => {
    const read = await perform<DeliveryView>('statement_delivery', {});
    return read.ok ? read.output : null;
  },
);

export const saveDelivery = createServerFn({ method: 'POST' })
  .validator((input: unknown) => deliveryInput.parse(input))
  .handler(({ data }) =>
    perform<{ enabled: boolean; hour: number; destinations: string[] }>('statement_set_delivery', data),
  );

export const sendStatementNow = createServerFn({ method: 'POST' }).handler(() =>
  perform<{ outcome: SendingOutcome[] }>('statement_send_now', {}),
);

/**
 * A question that was spoken: heard once, never kept, and given back as words for the person to
 * see before they are sent. Metered to the organization.
 */
export const transcribeQuestion = createServerFn({ method: 'POST' })
  .validator((input: unknown) => z.object({ audio: z.string().min(100).max(4_200_000) }).parse(input))
  .handler(async ({ data }): Promise<{ text: string }> => {
    const { identity, caller, as } = await signedIn();
    return as(async () => {
      const transcriber = getTranscriber();
      if (!holds('assistant:ask') || !transcriber) return { text: '' };
      const context = {
        organizationId: caller.organizationId,
        actor: {
          kind: 'agent' as const,
          id: ASSISTANT,
          channel: 'chat' as const,
          onBehalfOf: { kind: 'person' as const, id: identity.userId },
        },
        purpose: 'ask_voice',
        model: `${transcriber.provider}:${transcriber.modelId}`,
      };
      const store = getBudgets();
      await store.check(context);
      let text = '';
      try {
        const heard = await transcribe({
          model: transcriber,
          audio: new Uint8Array(Buffer.from(data.audio, 'base64')),
        });
        text = heard.text.trim().slice(0, 500);
      } catch (error) {
        if (!NoTranscriptGeneratedError.isInstance(error)) throw error;
      }
      await store.record(context, { inputTokens: 0, outputTokens: 0, modelCalls: 1 });
      return { text };
    });
  });

/** What deserves a look today, for whoever reads the deposits; empty otherwise. */
export const fetchAlerts = createServerFn({ method: 'GET' }).handler(async (): Promise<Alert[]> => {
  const read = await perform<{ alerts: Alert[] }>('alerts_read', {});
  return read.ok ? read.output.alerts : [];
});

export interface MessagingView {
  link: { telegram: boolean; whatsapp: boolean };
  token: string;
  telegramLink: string | null;
  connected: { whatsapp: boolean; telegram: boolean };
}

/** The person's own messaging link to the assistant; null when she may not ask. */
export const fetchMessagingLink = createServerFn({ method: 'GET' }).handler(
  async (): Promise<MessagingView | null> => {
    const read = await perform<MessagingView>('assistant_messaging', {});
    return read.ok ? read.output : null;
  },
);

export const untieMessagingLink = createServerFn({ method: 'POST' }).handler(() =>
  perform<{ untied: boolean }>('assistant_untie_messaging', {}),
);
