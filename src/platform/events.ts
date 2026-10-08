import { createAppToken } from '@kete/auth';
import { describePermissions } from '@kete/capabilities';
import {
  createOutboxRelay,
  httpTransport,
  outboxBacklog,
  parseManifest,
  type HealthOptions,
  type Manifest,
} from '@kete/sdk';
import { z } from 'zod';
import { orderEvents } from '@/features/orders';
import app from '../../kete.json' with { type: 'json' };
import { CENTER_OUTBOX } from './announce';
import { PRODUCT, VERSION } from './app';
import { getCenter } from './center';
import { getPool } from './db';
import { env } from './env';
import { datasets, registry } from './registry';
import { permissions } from './rights';

/** The events this app announces to Kete Cockpit; its manifest declares exactly these. */
export const DECLARED_EVENTS: string[] = [...app.events];

function environment(): Manifest['environment'] {
  const value = process.env.KETE_ENVIRONMENT;
  return value === 'production' || value === 'staging' || value === 'preview'
    ? value
    : 'development';
}

/** The business events of every feature, announced to the center. */
const EMITTED = [...orderEvents];

/** Where agents and other apps reach this app, once its address is known. */
function endpoints(): { endpoints?: { mcp: string; api: string } } {
  try {
    return { endpoints: { mcp: `${env.publicUrl}/mcp`, api: `${env.publicUrl}/api/v1` } };
  } catch {
    return {};
  }
}

/** The app's client id at the Compte Kete, once registered. */
function client(): { client?: string } {
  const id = process.env.KETE_CLIENT_ID;
  return id ? { client: id } : {};
}

/** The app's self-description, served at /.well-known/kete. */
export function manifest(): Manifest {
  return parseManifest({
    product: PRODUCT,
    name: app.name,
    version: VERSION,
    environment: environment(),
    events: DECLARED_EVENTS,
    // Who answers for the app, its data, its use of AI, its criticality (doctrine D-040).
    governance: app.governance,
    // What it exposes, and where (kete-core spec 045): the registry of Kete Enterprise reads them.
    capabilities: registry.describeAll(),
    datasets: datasets.describeAll(),
    // Its permissions and their words (kete-core spec 049): Kete Enterprise lets an administrator
    // grant them; its client id lets the center accept the app's own tokens.
    permissions: describePermissions(permissions),
    // The business events it announces to its center, and their data (kete-core spec 049).
    emits: EMITTED.map((e) => ({
      type: e.type,
      description: e.description,
      classification: e.classification,
      data: z.toJSONSchema(e.data) as Record<string, unknown>,
    })),
    ...client(),
    ...endpoints(),
  });
}

export const health: HealthOptions = {
  version: VERSION,
  dependencies: [{ name: 'database', probe: () => getPool().query('select 1') }],
  // Events waiting to be delivered to Kete Cockpit.
  backlog: () => outboxBacklog(getPool()),
};

/** Delivers the outbox to Kete Cockpit once, when its key is configured (the worker's job). */
export async function flushEvents(): Promise<void> {
  const url = process.env.KETE_EVENTS_URL;
  const kid = process.env.KETE_EVENTS_KID;
  const secret = process.env.KETE_EVENTS_SECRET;
  if (!url || !kid || !secret) return;
  await createOutboxRelay({
    pool: getPool(),
    transport: httpTransport({ url }),
    product: PRODUCT,
    key: { kid, secret },
  }).flush();
}

let appToken: (() => Promise<string | null>) | undefined;

/**
 * Delivers the business events to the center once (the worker's job), with the app's own token
 * (`kete:center`, kete-core spec 049): no shared key. Without a center or a client, they wait.
 */
export async function flushCenterEvents(): Promise<void> {
  const url = getCenter().eventsUrl;
  const accountUrl = process.env.KETE_ACCOUNT_URL;
  const clientId = process.env.KETE_CLIENT_ID;
  const clientSecret = process.env.KETE_CLIENT_SECRET;
  if (!url || !accountUrl || !clientId || !clientSecret) return;
  appToken ??= createAppToken({ accountUrl, clientId, clientSecret, scope: 'kete:center' });
  await createOutboxRelay({
    pool: getPool(),
    outbox: CENTER_OUTBOX,
    transport: httpTransport({ url, token: appToken }),
    product: PRODUCT,
  }).flush();
}
