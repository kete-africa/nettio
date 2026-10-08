import { createFeedbackHandler } from '@kete/feedback';
import { createFileRoute } from '@tanstack/react-router';
import { transaction } from '@/platform/db';
import { personOf, screenActor } from '@/platform/session';

const handler = createFeedbackHandler({
  async caller(request) {
    const identity = await personOf(request);
    if (!identity?.organizationId) return null;
    return { organizationId: identity.organizationId, actor: screenActor(identity) };
  },
  transaction,
});

// The feedback button's address (@kete/feedback).
export const Route = createFileRoute('/api/avis')({
  server: { handlers: { POST: ({ request }) => handler(request) } },
});
