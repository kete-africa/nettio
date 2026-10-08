import { createFileRoute } from '@tanstack/react-router';
import { whatsappSubscription, whatsappWebhook } from '@/platform/inbound';

// Where WhatsApp tells the laundry what its customers wrote; signed by Meta, checked first.
export const Route = createFileRoute('/webhooks/whatsapp')({
  server: {
    handlers: {
      GET: ({ request }) => whatsappSubscription(request),
      POST: ({ request }) => whatsappWebhook(request),
    },
  },
});
