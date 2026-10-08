import { createEvent, recordEvent, type SqlExecutor } from '@kete/sdk';
import { PRODUCT } from './app';

/** The outbox of the app's business events, delivered to its center (kete-core spec 049). */
export const CENTER_OUTBOX = 'kete_center_outbox';

/**
 * Announces a business fact to the center, in the caller's transaction: the change and its event
 * commit or roll back together. Identifiers and facts only — never a name nor a contact: a
 * subscriber reads the rest at the app's API, under its own rights. The type is declared in the
 * feature's `events.ts`, which the manifest lists (`emits`).
 */
export async function announce(
  db: SqlExecutor,
  input: { type: string; organization: string; data: Record<string, unknown> },
): Promise<void> {
  const event = createEvent({ ...input, product: PRODUCT, declaredTypes: [input.type] });
  await recordEvent(db, event, { outbox: CENTER_OUTBOX });
}
