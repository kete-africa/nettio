import type { SqlExecutor } from '@kete/tenancy';

/** What is about to be late, and today's discounts above the laundry's ceiling. */
export async function orderWarnings(
  db: SqlExecutor,
  query: { from: Date; to: Date; ceilingPercent: number },
): Promise<{ dueSoon: number; discountsOverCeiling: number }> {
  const { rows } = await db.query<{ due_soon: string; over: string }>(
    `select count(*) filter (where status in ('received', 'in_progress')
                               and promised_at >= now()
                               and promised_at < now() + interval '24 hours') as due_soon,
            count(*) filter (where created_at >= $1 and created_at < $2 and status <> 'cancelled'
                               and discount > 0
                               and discount * 100.0 / (total + discount) > $3) as over
       from orders`,
    [query.from, query.to, query.ceilingPercent],
  );
  return {
    dueSoon: Number(rows[0]?.due_soon ?? 0),
    discountsOverCeiling: Number(rows[0]?.over ?? 0),
  };
}
