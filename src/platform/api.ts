import { createHttpApi } from '@kete/capabilities';
import { env } from './env';
import { bearerOf, identityFromBearer } from './identity';
import { datasets, registry } from './registry';
import { asPerson } from './rights';

let handler: ((request: Request) => Promise<Response>) | undefined;

/**
 * The app's API (kete-core spec 045): its capabilities and data sets under /api/v1, for other Kete
 * apps and people's dashboards. The caller is an app acting for the person whose token it holds:
 * it acts within her rights and only prepares a decision (a draft she validates).
 */
export async function handleApi(request: Request): Promise<Response> {
  const identity = await identityFromBearer(request);
  handler ??= createHttpApi({
    registry,
    datasets,
    prefix: '/api/v1',
    resourceMetadataUrl: `${env.publicUrl}/.well-known/oauth-protected-resource`,
    async caller() {
      if (!identity?.organizationId) return null;
      return {
        organizationId: identity.organizationId,
        // An agent's mandate makes it the agent, for the person (kete-core spec 049): its autonomy
        // rules apply, and the journal names it.
        actor: identity.actingAgent
          ? {
              kind: 'agent',
              id: identity.actingAgent.id,
              channel: 'api',
              onBehalfOf: { kind: 'person', id: identity.userId },
            }
          : {
              kind: 'app',
              id: 'app_api',
              channel: 'api',
              onBehalfOf: { kind: 'person', id: identity.userId },
            },
      };
    },
  });
  const current = handler;
  // Her grants are read with the token the calling app holds for her.
  return asPerson(identity, () => current(request), bearerOf(request));
}
