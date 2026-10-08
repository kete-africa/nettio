import type { KeteIdentity } from '@kete/auth';
import { createMcpHandler, type Caller } from '@kete/capabilities';
import { createTestSchema, type TestSchema } from '@kete/testing';
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';
import { migrations } from '../db/migrations';
import { notePresence } from '../src/features/business/infrastructure/business.tables';
import type { BusinessRole } from '../src/features/business';
import { RuleError } from '../src/lib/rule-error';
import { transaction, usePool } from '../src/platform/db';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { screenActor } from '../src/platform/session';

// What every test file shares: an isolated schema with the app's migrations, people of an
// organization, and the two ways a gesture arrives — a person on a screen, an agent for her.

export async function freshSchema(): Promise<TestSchema> {
  const db = await createTestSchema({
    migrate: async (owner, context) => {
      for (const migration of migrations) await owner.query(migration.sql(context));
    },
  });
  usePool(db.app);
  return db;
}

export const person = (
  userId: string,
  role: KeteIdentity['role'],
  organizationId = 'org_acme',
): KeteIdentity => ({
  userId,
  email: `${userId}@example.test`,
  name: userId,
  organizationId,
  role,
  apps: {},
  twoFactor: false,
  expiresAt: new Date(Date.now() + 60_000),
});

export const onScreen = (identity: KeteIdentity): Caller => ({
  actor: screenActor(identity),
  organizationId: identity.organizationId ?? '',
});

export const agentFor = (identity: KeteIdentity): Caller => ({
  actor: {
    kind: 'agent',
    id: 'agt_mcp',
    channel: 'mcp',
    onBehalfOf: { kind: 'person', id: identity.userId },
  },
  organizationId: identity.organizationId ?? '',
});

/** A person's gesture on a screen, as `perform` runs it: its output, or the rule's code. */
export async function act<T = Record<string, unknown>>(
  identity: KeteIdentity,
  name: string,
  input: unknown,
): Promise<{ ok: true; output: T } | { ok: false; code: string }> {
  try {
    const result = await asPerson(identity, () =>
      registry.invoke({ ...onScreen(identity), name, input, confirmed: true }),
    );
    if (result.status === 'done') return { ok: true, output: result.output as T };
    if (result.status === 'refused') return { ok: false, code: result.reason };
    return { ok: false, code: result.status };
  } catch (error) {
    if (error instanceof RuleError) return { ok: false, code: error.code };
    throw error;
  }
}

/** The output of a gesture that must go through. */
export async function done<T = Record<string, unknown>>(
  identity: KeteIdentity,
  name: string,
  input: unknown,
): Promise<T> {
  const outcome = await act<T>(identity, name, input);
  if (!outcome.ok) throw new Error(`${name} was stopped: ${outcome.code}`);
  return outcome.output;
}

/** Makes a member of the organization appear in the team, with a business role or none. */
export async function hire(identity: KeteIdentity, role: BusinessRole | null): Promise<void> {
  const organizationId = identity.organizationId ?? '';
  await transaction(organizationId, (db) =>
    notePresence(db, organizationId, { userId: identity.userId, name: identity.name, role }),
  );
}

/** A copilot the person signed in with, talking to the app's MCP endpoint. */
export async function connect(identity: KeteIdentity): Promise<Client> {
  const handler = createMcpHandler({
    registry,
    server: { name: 'nettio', version: '0.0.0' },
    caller: async () => agentFor(identity),
    views: [{ uri: 'ui://kete/review', name: 'review', html: async () => '<!doctype html>' }],
    draftUrl: (id) => `https://app.test/verification/${id}`,
  });
  const client = new Client(
    { name: 'copilot', version: '0.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  );
  const transport = new StreamableHTTPClientTransport(new URL('https://app.test/mcp'), {
    fetch: (url, init) => asPerson(identity, () => handler(new Request(url, init))),
  });
  await client.connect(transport);
  return client;
}
