import { getRequest } from '@tanstack/react-start/server';
import { RuleError, type Outcome } from '@/lib/rule-error';
import { registry } from './registry';
import { asPerson } from './rights';
import { personOf, screenActor, tokenOf } from './session';

export class ScreenError extends Error {
  constructor(readonly code: 'signed_out' | 'no_organization' | 'forbidden' | 'not_found') {
    super(code);
    this.name = 'ScreenError';
  }
}

/** The person on this screen, in her organization, with her rights for what follows. */
export async function signedIn() {
  const request = getRequest();
  const identity = await personOf(request);
  if (!identity) throw new ScreenError('signed_out');
  if (!identity.organizationId) throw new ScreenError('no_organization');
  const token = await tokenOf(request);
  return {
    identity,
    caller: { actor: screenActor(identity), organizationId: identity.organizationId },
    /** Runs `work` with her rights: the center's grants, or those of her business role. */
    as: <T>(work: () => T | Promise<T>) => asPerson(identity, work, token),
  };
}

/**
 * A person's gesture on a screen: the same capability an agent would call, under her rights. A
 * broken rule comes back as its code, never as a crash; the screen's own dialog has already
 * confirmed what cannot be undone.
 */
export async function perform<T = unknown>(
  name: string,
  input: unknown,
  /** The gesture's key: sent twice — a double tap, a retry — it runs once. */
  idempotencyKey?: string,
): Promise<Outcome<T>> {
  const { caller, as } = await signedIn();
  try {
    const result = await as(() =>
      registry.invoke({
        ...caller,
        name,
        input,
        confirmed: true,
        ...(idempotencyKey ? { idempotencyKey } : {}),
      }),
    );
    if (result.status === 'done') return { ok: true, output: result.output as T };
    if (result.status === 'refused') return { ok: false, code: result.reason, facts: {} };
    return { ok: false, code: 'not_possible', facts: {} };
  } catch (error) {
    if (error instanceof RuleError) return { ok: false, code: error.code, facts: error.facts };
    throw error;
  }
}
