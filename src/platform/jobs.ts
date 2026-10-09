import {
  createJobs,
  defineJob,
  queuedSender,
  relayEventsJob,
  sendEmailJob,
  type Jobs,
} from '@kete/jobs';
import { createMailer, emailSenderFromEnv, type Mailer } from '@kete/notify';
import { organizationsDue, sendDueStatement } from '@/features/assistant';
import { deliver } from '@/features/messaging';
import { getChannels } from './channels';
import { getPool, transaction } from './db';
import { tellDecidersOf } from './decisions';
import { env } from './env';
import { flushCenterEvents, flushEvents } from './events';
import { sendingPorts } from './statement';

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
    // And what waits for a manager's decision is said to those who decide (specs/025-manager).
    await transaction(organizationId, (db) => tellDecidersOf(db));
  },
});

export const SEND_STATEMENTS = 'send-statements';

/**
 * Every hour: the evening statement of each laundry whose hour has come, to where it decided
 * (specs/013-statement-sent). One laundry that fails does not hold the others back.
 */
const sendStatementsJob = defineJob<Record<string, never>>({
  name: SEND_STATEMENTS,
  schedule: '5 * * * *',
  async handle() {
    const now = new Date();
    const due = await organizationsDue(getPool(), {
      hour: now.getUTCHours(),
      day: now.toISOString().slice(0, 10),
    });
    const ports = await sendingPorts();
    for (const organizationId of due) {
      try {
        await transaction(organizationId, (db) => sendDueStatement(db, ports, now));
      } catch (error) {
        console.warn('[statement] not sent for an organization', error instanceof Error ? error.message : '');
      }
    }
  },
});

/**
 * Whether this process also works the jobs (NETTIO_WORKER=on): for a deployment with one
 * container, like Firmo's staging. Otherwise the worker role does (`pnpm worker`).
 */
export const worksInProcess = (): boolean => process.env.NETTIO_WORKER === 'on';

let jobs: Jobs | undefined;
let started: Promise<void> | undefined;

/** Starts the queue once: to send jobs, and to work them when this process is also the worker. */
export function startJobs(): Promise<void> {
  started ??= getJobs().start();
  return started;
}

/**
 * The app's background jobs (pg-boss, on its own Postgres): the web process sends them, the worker
 * works them — one image, two roles.
 */
export function getJobs(work = worksInProcess()): Jobs {
  jobs ??= createJobs({
    connectionString: env.ownerDatabaseUrl,
    // Events to Kete Cockpit (counters) and to the center (business facts), every minute.
    jobs: [
      sendEmailJob(emailSenderFromEnv()),
      relayEventsJob(() => Promise.all([flushEvents(), flushCenterEvents()])),
      deliverMessagesJob,
      sendStatementsJob,
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
  await startJobs();
  await getJobs().send(name, data, options);
}

/** E-mails leave through the queue: a request never waits for the provider, an outage is retried. */
export async function mailer(): Promise<Mailer> {
  await startJobs();
  return createMailer({ sender: queuedSender(getJobs()), from: env.mailFrom });
}
