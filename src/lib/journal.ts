import { readAudit } from '@kete/admin';
import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { transaction } from '@/platform/db';
import { asPerson, holds } from '@/platform/rights';
import { personOf, tokenOf } from '@/platform/session';

/** The organization's journal, for its owner and admins: every gesture, by whom, through what. */
export const fetchJournal = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest();
  const identity = await personOf(request);
  if (!identity?.organizationId) return null;
  const organizationId = identity.organizationId;
  return asPerson(
    identity,
    async () => {
      if (!holds('journal:read')) return null;
      const entries = await transaction(organizationId, (db) => readAudit(db, { limit: 100 }));
      return { me: identity.userId, entries };
    },
    await tokenOf(request),
  );
});
