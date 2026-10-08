import type { Actor } from '@kete/commands';

/** The person behind a gesture: herself, or the one an agent acts for. */
export const personBehind = (actor: Actor): string =>
  actor.kind === 'person' ? actor.id : (actor.onBehalfOf?.id ?? actor.id);

/** Who signs a gesture in a history: the person, or the agent acting for her. */
export const signer = (actor: Actor): { id: string; kind: string } => ({
  id: actor.id,
  kind: actor.kind,
});
