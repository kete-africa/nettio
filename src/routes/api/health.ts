import { healthHandler } from '@kete/sdk';
import { createFileRoute } from '@tanstack/react-router';
import { health } from '@/platform/events';

export const Route = createFileRoute('/health')({
  server: { handlers: { GET: healthHandler(health) } },
});
