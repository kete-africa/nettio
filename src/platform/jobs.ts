import {
  createJobs,
  defineJob,
  queuedSender,
  relayEventsJob,
  sendEmailJob,
  type Jobs,
} from '@kete/jobs';
import { createMailer, emailSenderFromEnv, type Mailer } from '@kete/notify';
import { deliver } from '@/features/messaging';
import { getChannels } from './channels';
import { transaction } from './db';
import { env } from './env';
import { flushCenterEvents, flushEvents } from './events';

export const DELIVER_MESSAGES = 'deliver-messages';

/** Sends what waits for an organization's customers, through each message's channel. */
const deliverMessagesJob = defineJob<{ organizationId: string }>({
  name: DELIVER_MESSAGES,
  retryLimit: 5,
  retryDelay: 60,
  retryBackoff: true,
  async handle({ organizationId }) {
    const result = await transaction(organizationId, (db) => deliver(db, getChannels()));
    // A provider that did not answer is tried again; a refusal keeps its reason on the message.
    if (result.failed > 0) console.warn(`[messages] ${result.failed} not delivered`);
  },
});

let jobs: Jobs | undefined;
let started: Promise<void> | undefined;

/**
 * The app's background jobs (pg-boss, on its own Postgres): the web process sends them, the worker
 * works them — one image, two roles.
 */
export function getJobs(work = false): Jobs {
  jobs ??= createJobs({
    connectionString: env.ownerDatabaseUrl,
    // Events to Kete Cockpit (counters) and to the center (business facts), every minute.
    jobs: [
      sendEmailJob(emailSenderFromEnv()),
      relayEventsJob(() => Promise.all([flushEvents(), flushCenterEvents()])),
      deliverMessagesJob,
    ] as never,
    work,
  });
  return jobs;
}

/** Queues a job from the web process, starting the queue once. */
export async function sendJob(
  name: string,
  data: object,
  options?: { singletonKey?: string },
): Promise<void> {
  const queue = getJobs();
  started ??= queue.start();
  await started;
  await queue.send(name, data, options);
}

/** E-mails leave through the queue: a request never waits for the provider, an outage is retried. */
export async function mailer(): Promise<Mailer> {
  const queue = getJobs();
  started ??= queue.start();
  await started;
  return createMailer({ sender: queuedSender(queue), from: env.mailFrom });
}
