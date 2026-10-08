import { createJobs, queuedSender, relayEventsJob, sendEmailJob, type Jobs } from '@kete/jobs';
import { createMailer, emailSenderFromEnv, type Mailer } from '@kete/notify';
import { env } from './env';
import { flushCenterEvents, flushEvents } from './events';

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
    ] as never,
    work,
  });
  return jobs;
}

/** E-mails leave through the queue: a request never waits for the provider, an outage is retried. */
export async function mailer(): Promise<Mailer> {
  const queue = getJobs();
  started ??= queue.start();
  await started;
  return createMailer({ sender: queuedSender(queue), from: env.mailFrom });
}
