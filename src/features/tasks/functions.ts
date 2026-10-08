import type { DraftReview } from '@kete/capabilities';
import { executeCommand } from '@kete/commands';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { transaction } from '@/platform/db';
import { registry } from '@/platform/registry';
import { asPerson, holds } from '@/platform/rights';
import { personOf, screenActor, tokenOf } from '@/platform/session';
import { reopenTask } from './commands/complete-task';
import { findTask, listTasks } from './infrastructure/task.table';
import { taskInput } from './task.record';

/** A draft as the verification screen shows it: plain, serializable values. */
export interface ReviewScreen {
  draftId: string;
  description: string;
  autonomy: 3 | 4;
  status: 'prepared' | 'validated' | 'refused';
  fields: {
    key: string;
    title: string;
    value: string;
    source: string | null;
    uncertain: boolean;
  }[];
}

function toScreen(review: DraftReview): ReviewScreen {
  const properties = (review.schema['properties'] ?? {}) as Record<string, { title?: string }>;
  return {
    draftId: review.draftId,
    description: review.description,
    autonomy: review.autonomy,
    status: review.status,
    fields: Object.entries(review.values).map(([key, value]) => {
      const provenance = review.provenance[key];
      return {
        key,
        title: properties[key]?.title ?? key,
        value: value === null || value === undefined ? '' : String(value),
        source: provenance?.source ?? null,
        uncertain: provenance?.certainty === 'low',
      };
    }),
  };
}

export class ScreenError extends Error {
  constructor(readonly code: 'signed_out' | 'no_organization' | 'forbidden' | 'not_found') {
    super(code);
    this.name = 'ScreenError';
  }
}

/** The person on this screen, in her organization, with her rights for what follows. */
async function signedIn() {
  const request = getRequest();
  const identity = await personOf(request);
  if (!identity) throw new ScreenError('signed_out');
  if (!identity.organizationId) throw new ScreenError('no_organization');
  const token = await tokenOf(request);
  return {
    identity,
    caller: { actor: screenActor(identity), organizationId: identity.organizationId },
    /** Runs `work` with her rights: her grants at the center, or her role's defaults. */
    as: <T>(work: () => T | Promise<T>) => asPerson(identity, work, token),
  };
}

export const fetchPerson = createServerFn({ method: 'GET' }).handler(async () => {
  const identity = await personOf(getRequest());
  return identity ? { name: identity.name, organizationId: identity.organizationId } : null;
});

export const fetchTasks = createServerFn({ method: 'GET' }).handler(async () => {
  const { caller, as } = await signedIn();
  return as(async () => {
    if (!holds('tasks:read')) throw new ScreenError('forbidden');
    return transaction(caller.organizationId, (db) => listTasks(db));
  });
});

export const fetchTask = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ taskId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data }) => {
    const { caller, as } = await signedIn();
    return as(async () => {
      if (!holds('tasks:read')) throw new ScreenError('forbidden');
      return transaction(caller.organizationId, (db) => findTask(db, data.taskId));
    });
  });

/** A person adds a task: the same capability an agent would only prepare a draft of. */
export const addTask = createServerFn({ method: 'POST' })
  .validator((input: unknown) => taskInput.parse(input))
  .handler(async ({ data }) => {
    const { caller, as } = await signedIn();
    const result = await as(() =>
      registry.invoke({ ...caller, name: 'tasks_create', input: data }),
    );
    return { status: result.status };
  });

export const setTaskDone = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z.object({ taskId: z.string().min(1).max(64), done: z.boolean() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { caller, as } = await signedIn();
    return as(async () => {
      if (data.done) {
        const result = await registry.invoke({
          ...caller,
          name: 'tasks_complete',
          input: { taskId: data.taskId },
        });
        return { status: result.status };
      }
      if (!holds('tasks:write')) throw new ScreenError('forbidden');
      await transaction(caller.organizationId, (db) =>
        executeCommand(db, reopenTask, {
          ...caller,
          idempotencyKey: `screen-${randomUUID()}`,
          input: { taskId: data.taskId },
        }),
      );
      return { status: 'done' };
    });
  });

/** A draft an agent prepared, as the person sees it before deciding. */
export const fetchReview = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ draftId: z.string().min(1).max(128) }).parse(input))
  .handler(async ({ data }) => {
    const { caller, as } = await signedIn();
    const review = await as(() => registry.review(caller, data.draftId));
    return review ? toScreen(review) : null;
  });

/** The person decides; level 4 arrives here already confirmed by the screen's dialog. */
export const decideReview = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .discriminatedUnion('action', [
        z.object({
          action: z.literal('validate'),
          draftId: z.string().min(1).max(128),
          confirmed: z.boolean(),
        }),
        z.object({
          action: z.literal('refuse'),
          draftId: z.string().min(1).max(128),
          reason: z.string().trim().min(1).max(1000),
        }),
      ])
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { caller, as } = await signedIn();
    const decided = await as(() =>
      data.action === 'validate'
        ? registry.decide({
            ...caller,
            draftId: data.draftId,
            action: 'validate',
            confirmed: data.confirmed,
          })
        : registry.decide({
            ...caller,
            draftId: data.draftId,
            action: 'refuse',
            reason: data.reason,
          }),
    );
    return { status: decided.status };
  });
