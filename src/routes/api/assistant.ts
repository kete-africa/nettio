import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { converse, type AssistantEvent } from '@/features/assistant/ask';
import { asPerson, holds } from '@/platform/rights';
import { personOf, tokenOf } from '@/platform/session';

const asked = z.object({
  question: z.string().trim().min(2).max(500),
  history: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(4000) }))
    .max(24)
    .default([]),
  screen: z.string().max(120).optional(),
});

/**
 * The assistant's address: one question in, the answer out as it is written — one JSON event per
 * line (its words, the readings it opens, the gestures it prepares). Everything runs within the
 * rights of the person who asks, for the whole life of the stream.
 */
async function answer(request: Request): Promise<Response> {
  const identity = await personOf(request);
  if (!identity?.organizationId) return new Response(null, { status: 401 });
  const organizationId = identity.organizationId;
  const parsed = asked.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  return asPerson(
    identity,
    () => {
      if (!holds('assistant:ask')) return new Response(null, { status: 403 });
      const encoder = new TextEncoder();
      const line = (event: AssistantEvent) => encoder.encode(`${JSON.stringify(event)}\n`);
      const events = converse({ userId: identity.userId, organizationId }, parsed.data);
      const stream = new ReadableStream<Uint8Array>({
        // Started here, inside the person's rights: every reading the model opens stays hers.
        async start(controller) {
          try {
            for await (const event of events) controller.enqueue(line(event));
          } catch {
            controller.enqueue(line({ type: 'unavailable', reason: 'failed' }));
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, {
        headers: {
          'content-type': 'application/x-ndjson; charset=utf-8',
          'cache-control': 'no-store',
          'x-accel-buffering': 'no',
        },
      });
    },
    await tokenOf(request),
  );
}

export const Route = createFileRoute('/api/assistant')({
  server: { handlers: { POST: ({ request }) => answer(request) } },
});
