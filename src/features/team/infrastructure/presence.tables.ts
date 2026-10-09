import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { Period } from '../domain/presence';

// The stretches of presence each person declared (specs/024-presence): she clocks in, she clocks
// out. A stretch is never rewritten: it is opened, then closed once.

export function presenceMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  return `
create table ${s}.clockings (
  clocking_id text primary key,
  organization_id text not null,
  user_id text not null,
  site_id text references ${s}.sites (site_id),
  started_at timestamptz not null default clock_timestamp(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
-- One open stretch per person: she is at work, or she is not.
create unique index clockings_one_open on ${s}.clockings (organization_id, user_id)
  where ended_at is null;
create index clockings_by_start on ${s}.clockings (organization_id, started_at);
${organizationPolicySql({ schema: s, table: 'clockings', appRole: options.appRole })}
grant select, insert, update on ${s}.clockings to ${options.appRole};
`;
}

/** Opens a person's stretch; false when one is already open. */
export async function openClocking(
  db: SqlExecutor,
  organizationId: string,
  input: { userId: string; siteId: string | null },
): Promise<boolean> {
  const { rows } = await db.query<{ clocking_id: string }>(
    `insert into clockings (clocking_id, organization_id, user_id, site_id)
     select $1, $2, $3, $4
      where not exists (select 1 from clockings where user_id = $3 and ended_at is null)
     returning clocking_id`,
    [newId('clk'), organizationId, input.userId, input.siteId],
  );
  return rows.length > 0;
}

/** Closes a person's open stretch; null when she had none. */
export async function closeClocking(
  db: SqlExecutor,
  userId: string,
): Promise<{ startedAt: Date; endedAt: Date } | null> {
  const { rows } = await db.query<{ started_at: Date; ended_at: Date }>(
    `update clockings set ended_at = clock_timestamp()
      where user_id = $1 and ended_at is null
      returning started_at, ended_at`,
    [userId],
  );
  return rows[0] ? { startedAt: rows[0].started_at, endedAt: rows[0].ended_at } : null;
}

/** The stretches that touch a window, for everyone or one person; the open ones included. */
export async function periodsWithin(
  db: SqlExecutor,
  window: { from: Date; to: Date },
  userId?: string,
): Promise<Period[]> {
  const { rows } = await db.query<{ user_id: string; started_at: Date; ended_at: Date | null }>(
    `select user_id, started_at, ended_at from clockings
      where started_at < $2 and (ended_at is null or ended_at >= $1)
        and ($3::text is null or user_id = $3)
      order by started_at`,
    [window.from, window.to, userId ?? null],
  );
  return rows.map((row) => ({ userId: row.user_id, startedAt: row.started_at, endedAt: row.ended_at }));
}
