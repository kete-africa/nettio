import handler from '@tanstack/react-start/server-entry';
import { paraglideMiddleware } from './paraglide/server.js';
import { onDeliveryAsked } from './platform/channels';
import { DELIVER_MESSAGES, sendJob, startJobs, worksInProcess } from './platform/jobs';

// A message queued for a laundry's customer is delivered by the worker: the web process asks.
onDeliveryAsked((organizationId) => {
  void sendJob(DELIVER_MESSAGES, { organizationId }, { singletonKey: organizationId }).catch(
    () => undefined,
  );
});

// A deployment with one container works its jobs here (NETTIO_WORKER=on): messages, events.
if (worksInProcess()) {
  void startJobs()
    .then(() => console.log('[worker] working the jobs, in the web process'))
    .catch((error: unknown) => console.error('[worker] did not start', error));
}

export default {
  fetch(request: Request): Promise<Response> {
    // Every request resolves its language first, so server-rendered text matches it.
    return paraglideMiddleware(request, () => handler.fetch(request));
  },
};
