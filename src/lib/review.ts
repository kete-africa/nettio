import type { DraftReview } from '@kete/capabilities';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { registry } from '@/platform/registry';
import { signedIn } from '@/platform/screen';

/** A draft as the verification screen shows it: plain, serializable values. */
export interface ReviewScreen {
  draftId: string;
  description: string;
  autonomy: 3 | 4;
  status: 'prepared' | 'validated' | 'refused';
  fields: {
    key: string;
    title: string;
    value: string;
    source: string | null;
    uncertain: boolean;
  }[];
}

const shown = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

function toScreen(review: DraftReview): ReviewScreen {
  const properties = (review.schema['properties'] ?? {}) as Record<string, { title?: string }>;
  return {
    draftId: review.draftId,
    description: review.description,
    autonomy: review.autonomy,
    status: review.status,
    fields: Object.entries(review.values).map(([key, value]) => {
      const provenance = review.provenance[key];
      return {
        key,
        title: properties[key]?.title ?? key,
        value: shown(value),
        source: provenance?.source ?? null,
        uncertain: provenance?.certainty === 'low',
      };
    }),
  };
}

/** A draft an agent prepared, as the person sees it before deciding. */
export const fetchReview = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ draftId: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { caller, as } = await signedIn();
    const review = await as(() => registry.review(caller, data.draftId));
    return review ? toScreen(review) : null;
  });

/** The person decides; level 4 arrives here already confirmed by the screen's dialog. */
export const decideReview = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('validate'),
          draftId: z.string().min(1).max(128),
          confirmed: z.boolean(),
        }),
        z.object({
          action: z.literal('refuse'),
          draftId: z.string().min(1).max(128),
          reason: z.string().trim().min(1).max(1000),
        }),
      ])
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { caller, as } = await signedIn();
    const decided = await as(() =>
      data.action === 'validate'
        ? registry.decide({
            ...caller,
            draftId: data.draftId,
            action: 'validate',
            confirmed: data.confirmed,
          })
        : registry.decide({
            ...caller,
            draftId: data.draftId,
            action: 'refuse',
            reason: data.reason,
          }),
    );
    return { status: decided.status };
  });
