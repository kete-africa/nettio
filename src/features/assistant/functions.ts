import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { getLocale } from '@/paraglide/runtime.js';
import { getModel } from '@/platform/ai';
import { holds } from '@/platform/rights';
import { perform, signedIn } from '@/platform/screen';
import { askNettio, type AskOutcome } from './ask';
import { deliveryInput } from './delivery.record';
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
  return as(() => ({ allowed: holds('assistant:ask'), connected: getModel() !== null }));
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
