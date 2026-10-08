import { createFileRoute } from '@tanstack/react-router';
import { telegramWebhook } from '@/platform/inbound';

// Where Telegram tells the laundry what its customers wrote; its secret token is checked first.
export const Route = createFileRoute('/webhooks/telegram')({
  server: { handlers: { POST: ({ request }) => telegramWebhook(request) } },
});
