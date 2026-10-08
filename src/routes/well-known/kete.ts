import { manifestHandler } from '@kete/sdk';
import { createFileRoute } from '@tanstack/react-router';
import { manifest } from '@/platform/events';

// Who this app is and the events it announces (manifest.v1), for Kete Cockpit.
export const Route = createFileRoute('/.well-known/kete')({
  server: { handlers: { GET: () => manifestHandler(manifest())() } },
});
