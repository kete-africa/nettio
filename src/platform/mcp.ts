import { createMcpHandler, protectedResourceMetadata } from '@kete/capabilities';
import { keteViews } from '@kete/views';
import { APP_SLUG, DESIGN, VERSION } from './app';
import { env } from './env';
import { bearerOf, identityFromBearer } from './identity';
import { registry } from './registry';
import { asPerson, currentIdentity } from './rights';

let handler: ((request: Request) => Promise<Response>) | undefined;

function mcp(): (request: Request) => Promise<Response> {
  handler ??= createMcpHandler({
    registry,
    server: { name: APP_SLUG, version: VERSION },
    // The client acts for the person who signed in: an agent, never more than her.
    async caller() {
      const identity = currentIdentity();
      if (!identity?.organizationId) return null;
      return {
        actor: {
          kind: 'agent',
          // An agent of the center carries a mandate naming it (kete-core spec 049); a copilot
          // the person signed in with is « the copilot ».
          id: identity.actingAgent?.id ?? 'agt_mcp',
          channel: 'mcp',
          onBehalfOf: { kind: 'person', id: identity.userId },
        },
        organizationId: identity.organizationId,
      };
    },
    views: keteViews({ design: DESIGN === 'workspace' ? 'workspace' : 'kete' }),
    draftUrl: (id) => `${env.publicUrl}/verification/${id}`,
    resourceMetadataUrl: `${env.publicUrl}/.well-known/oauth-protected-resource`,
  });
  return handler;
}

/** The app's MCP endpoint: its capabilities and their views (doctrine D-037). */
export async function handleMcp(request: Request): Promise<Response> {
  const identity = await identityFromBearer(request);
  return asPerson(identity, () => mcp()(request), bearerOf(request));
}

/** Where MCP clients learn that the Compte Kete issues this endpoint's tokens (RFC 9728). */
export function mcpResourceMetadata(): Response {
  return protectedResourceMetadata({
    resource: `${env.publicUrl}/mcp`,
    authorizationServers: [env.accountUrl],
    // offline_access: the copilot keeps its access without asking the person again every 15 min.
    scopes: ['openid', 'profile', 'email', 'offline_access'],
  })();
}
