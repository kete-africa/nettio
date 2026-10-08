import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { WorkLine } from '../domain/pay';

// The laundry's piece rates, and what its people did and were handed (specs/015-team-pay). The
// work is read from the steps signed in the workshop; the money handed, from the expenses that
// name who received them.

export function teamMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  return `
-- What the laundry pays for one piece (or one kilo) passed at a step; a step without a line is
-- not paid by the piece.
create table ${s}.piece_rates (
  organization_id text not null,
  step_id text not null,
  amount integer not null check (amount between 0 and 1000000),
  updated_at timestamptz not null default now(),
  primary key (organization_id, step_id)
);
${organizationPolicySql({ schema: s, table: 'piece_rates', appRole: options.appRole })}
grant select, insert, update, delete on ${s}.piece_rates to ${options.appRole};

-- Who an expense of wages was handed to: an advance, a pay. Null for every other expense.
alter table ${s}.expenses add column paid_to text;
create index expenses_paid_to on ${s}.expenses (organization_id, paid_to) where paid_to is not null;
`;
}

/** The laundry's rates: step → amount for one piece. */
export async function readRates(db: SqlExecutor): Promise<Map<string, number>> {
  const { rows } = await db.query<{ step_id: string; amount: number }>(
    `select step_id, amount from piece_rates`,
  );
  return new Map(rows.map((row) => [row.step_id, row.amount]));
}

/** Sets the rate of a step; null removes it — the step is no longer paid by the piece. */
export async function saveRate(
  db: SqlExecutor,
  organizationId: string,
  rate: { stepId: string; amount: number | null },
): Promise<void> {
  if (rate.amount === null) {
    await db.query(`delete from piece_rates where step_id = $1`, [rate.stepId]);
    return;
  }
  await db.query(
    `insert into piece_rates (organization_id, step_id, amount) values ($1, $2, $3)
     on conflict (organization_id, step_id) do update set amount = $3, updated_at = now()`,
    [organizationId, rate.stepId, rate.amount],
  );
}

/**
 * What each person did in a period, step by step. A unit passed at a step for the first time
 * counts in `pieces`; passed again after a rework, in `redone`. Only steps a person signed
 * herself count: what an agent did is nobody's pay.
 */
export async function workDone(
  db: SqlExecutor,
  period: { from: string; to: string },
  userId?: string,
): Promise<WorkLine[]> {
  const { rows } = await db.query<{
    actor_id: string;
    step_id: string;
    step_name: string;
    pieces: string;
    redone: string;
  }>(
    `with passes as (
       select e.actor_id, e.step_id, e.step_name, e.at, u.quantity,
              row_number() over (partition by e.unit_id, e.step_id order by e.at, e.event_id) as pass
         from work_events e join work_units u on u.unit_id = e.unit_id
        where e.kind = 'step' and e.actor_kind = 'person'
     )
     select actor_id, step_id, max(step_name) as step_name,
            coalesce(sum(quantity) filter (where pass = 1), 0) as pieces,
            coalesce(sum(quantity) filter (where pass > 1), 0) as redone
       from passes
      where at >= $1::date and at < $2::date and ($3::text is null or actor_id = $3)
      group by actor_id, step_id
      order by actor_id, max(step_name)`,
    [period.from, period.to, userId ?? null],
  );
  return rows.map((row) => ({
    userId: row.actor_id,
    stepId: row.step_id,
    stepName: row.step_name,
    pieces: Number(row.pieces),
    redone: Number(row.redone),
  }));
}

/** What each person was handed in a period: the expenses that name her, voided ones apart. */
export async function handedTo(
  db: SqlExecutor,
  period: { from: string; to: string },
  userId?: string,
): Promise<Map<string, number>> {
  const { rows } = await db.query<{ paid_to: string; amount: string }>(
    `select paid_to, sum(amount) as amount from expenses
      where paid_to is not null and voided_at is null and not recurring
        and spent_on >= $1::date and spent_on < $2::date and ($3::text is null or paid_to = $3)
      group by paid_to`,
    [period.from, period.to, userId ?? null],
  );
  return new Map(rows.map((row) => [row.paid_to, Number(row.amount)]));
}
