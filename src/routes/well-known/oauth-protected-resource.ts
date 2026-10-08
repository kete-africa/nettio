import { createFileRoute } from '@tanstack/react-router';
import { mcpResourceMetadata } from '@/platform/mcp';

// Tells MCP clients that the Compte Kete issues this app's tokens (RFC 9728).
export const Route = createFileRoute('/.well-known/oauth-protected-resource')({
  server: { handlers: { GET: () => mcpResourceMetadata() } },
});
