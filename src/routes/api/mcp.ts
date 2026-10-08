import { createFileRoute } from '@tanstack/react-router';
import { handleMcp } from '@/platform/mcp';

// The app's capabilities and their views, for agents and copilots (MCP, doctrine D-037).
export const Route = createFileRoute('/mcp')({
  server: {
    handlers: {
      GET: ({ request }) => handleMcp(request),
      POST: ({ request }) => handleMcp(request),
      DELETE: ({ request }) => handleMcp(request),
    },
  },
});
