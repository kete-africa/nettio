import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { Behavior, Charge, ExpenseCategory } from '../domain/charges';
import type { CostedLine, CostSheet, PackSale } from '../domain/costs';
import { expectedCash, type TillFlows } from '../domain/till';
import type { CashSession, Expense, OwnerDraw, PaidFrom } from '../money.record';

/** The money's tables, each with its row-level security in the same migration. */
export function moneyMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
create table ${s}.cash_sessions (
  session_id text primary key,
  organization_id text not null,
  site_id text not null references ${s}.sites (site_id),
  cashier_id text not null,
  opening_float integer not null check (opening_float >= 0),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  -- Kept as they were at the closing: a gap is never corrected.
  expected integer,
  counted integer check (counted >= 0),
  gap integer,
  note text not null default ''
);
-- One open till per site and per cashier.
create unique index cash_sessions_one_open
  on ${s}.cash_sessions (organization_id, site_id, cashier_id) where closed_at is null;
create index cash_sessions_by_day on ${s}.cash_sessions (organization_id, opened_at);
${secure('cash_sessions', 'select, insert, update')}

-- Cash carried to the bank from a till.
create table ${s}.cash_movements (
  movement_id text primary key,
  organization_id text not null,
  session_id text not null references ${s}.cash_sessions (session_id),
  kind text not null check (kind in ('bank_deposit')),
  amount integer not null check (amount > 0),
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);
create index cash_movements_by_session on ${s}.cash_movements (session_id);
${secure('cash_movements', 'select, insert')}

-- The till a cash payment went into, or came out of.
alter table ${s}.payments add column cash_session_id text references ${s}.cash_sessions (session_id);
create index payments_by_session on ${s}.payments (cash_session_id);
-- The guard-rail: the deposit's total fell under the variable cost of its content.
alter table ${s}.orders add column below_cost boolean not null default false;
grant update (cash_session_id) on ${s}.payments to ${options.appRole};

-- Everything that goes out. Never deleted: voided, with a reason.
create table ${s}.expenses (
  expense_id text primary key,
  organization_id text not null,
  site_id text references ${s}.sites (site_id),
  spent_on date not null,
  label text not null check (length(label) between 1 and 160),
  category text not null,
  behavior text not null check (behavior in ('fixed', 'variable')),
  amount integer not null check (amount > 0),
  paid_from text not null check (paid_from in ('till', 'mobile_money', 'bank', 'other')),
  cash_session_id text references ${s}.cash_sessions (session_id),
  recurring boolean not null default false,
  stopped_on date,
  voided_at timestamptz,
  void_reason text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  check (not (recurring and paid_from = 'till'))
);
create index expenses_by_day on ${s}.expenses (organization_id, spent_on);
${secure('expenses', 'select, insert, update')}

-- What the owner takes: not an expense, shown apart.
create table ${s}.owner_draws (
  draw_id text primary key,
  organization_id text not null,
  site_id text references ${s}.sites (site_id),
  drawn_on date not null,
  amount integer not null check (amount > 0),
  paid_from text not null check (paid_from in ('till', 'mobile_money', 'bank', 'other')),
  cash_session_id text references ${s}.cash_sessions (session_id),
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);
create index owner_draws_by_day on ${s}.owner_draws (organization_id, drawn_on);
${secure('owner_draws', 'select, insert')}

-- What an article costs to treat for a service (or a kilo): measured, or only estimated.
create table ${s}.cost_sheets (
  sheet_id text primary key,
  organization_id text not null,
  service_id text not null references ${s}.services (service_id),
  article_id text references ${s}.articles (article_id),
  labor_minutes numeric(8, 2) not null default 0 check (labor_minutes >= 0),
  consumables_cost numeric(12, 2) not null default 0 check (consumables_cost >= 0),
  machine_cost numeric(12, 2) not null default 0 check (machine_cost >= 0),
  measured boolean not null default false,
  measured_on date not null default current_date,
  updated_by text not null,
  updated_at timestamptz not null default now()
);
create unique index cost_sheets_one_per_couple
  on ${s}.cost_sheets (organization_id, service_id, coalesce(article_id, ''));
${secure('cost_sheets', 'select, insert, update, delete')}
`;
}

// ── The till ──────────────────────────────────────────────────────────────────────────────────

type SessionRow = {
  session_id: string;
  site_id: string;
  cashier_id: string;
  cashier_name: string | null;
  opened_at: Date;
  closed_at: Date | null;
  opening_float: number;
  cash_in: string;
  cash_refunds: string;
  expenses: string;
  draws: string;
  bank_deposits: string;
  expected: number | null;
  counted: number | null;
  gap: number | null;
  note: string;
};

const sessionSelect = `
  select s.session_id, s.site_id, s.cashier_id, st.name as cashier_name, s.opened_at, s.closed_at,
         s.opening_float, s.expected, s.counted, s.gap, s.note,
         coalesce((select sum(amount) from payments p
                    where p.cash_session_id = s.session_id and p.kind <> 'refund'), 0) as cash_in,
         coalesce((select sum(amount) from payments p
                    where p.cash_session_id = s.session_id and p.kind = 'refund'), 0) as cash_refunds,
         coalesce((select sum(amount) from expenses e
                    where e.cash_session_id = s.session_id and e.voided_at is null), 0) as expenses,
         coalesce((select sum(amount) from owner_draws d
                    where d.cash_session_id = s.session_id), 0) as draws,
         coalesce((select sum(amount) from cash_movements mv
                    where mv.session_id = s.session_id and mv.kind = 'bank_deposit'), 0) as bank_deposits
    from cash_sessions s
    left join staff st on st.user_id = s.cashier_id`;

function toSession(row: SessionRow): CashSession {
  const flows: TillFlows = {
    openingFloat: row.opening_float,
    cashIn: Number(row.cash_in),
    cashRefunds: Number(row.cash_refunds),
    expenses: Number(row.expenses),
    draws: Number(row.draws),
    bankDeposits: Number(row.bank_deposits),
  };
  return {
    sessionId: row.session_id,
    siteId: row.site_id,
    cashierId: row.cashier_id,
    cashierName: row.cashier_name ?? row.cashier_id,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    ...flows,
    // A closed till keeps what it expected when it closed; an open one says it as of now.
    expected: row.expected ?? expectedCash(flows),
    counted: row.counted,
    gap: row.gap,
    note: row.note,
  };
}

export async function findSession(db: SqlExecutor, sessionId: string): Promise<CashSession | null> {
  const { rows } = await db.query<SessionRow>(`${sessionSelect} where s.session_id = $1`, [sessionId]);
  return rows[0] ? toSession(rows[0]) : null;
}

/** The open till of a cashier at a site, if any. */
export async function openSessionOf(
  db: SqlExecutor,
  cashierId: string,
  siteId: string,
): Promise<CashSession | null> {
  const { rows } = await db.query<SessionRow>(
    `${sessionSelect} where s.cashier_id = $1 and s.site_id = $2 and s.closed_at is null`,
    [cashierId, siteId],
  );
  return rows[0] ? toSession(rows[0]) : null;
}

/** The tills: the open ones first, then the latest closed; a cashier's own, or everyone's. */
export async function listSessions(
  db: SqlExecutor,
  query: { cashierId?: string | undefined; limit: number },
): Promise<CashSession[]> {
  const { rows } = await db.query<SessionRow>(
    `${sessionSelect}
      where ($1::text is null or s.cashier_id = $1)
      order by s.closed_at is not null, s.opened_at desc limit $2`,
    [query.cashierId ?? null, query.limit],
  );
  return rows.map(toSession);
}

export async function insertSession(
  db: SqlExecutor,
  organizationId: string,
  session: { siteId: string; cashierId: string; openingFloat: number },
): Promise<string> {
  const sessionId = newId('csh');
  await db.query(
    `insert into cash_sessions (session_id, organization_id, site_id, cashier_id, opening_float)
     values ($1, $2, $3, $4, $5)`,
    [sessionId, organizationId, session.siteId, session.cashierId, session.openingFloat],
  );
  return sessionId;
}

export async function closeSession(
  db: SqlExecutor,
  session: { sessionId: string; expected: number; counted: number; gap: number; note: string },
): Promise<void> {
  await db.query(
    `update cash_sessions set closed_at = now(), expected = $2, counted = $3, gap = $4, note = $5
      where session_id = $1 and closed_at is null`,
    [session.sessionId, session.expected, session.counted, session.gap, session.note],
  );
}

export async function insertBankDeposit(
  db: SqlExecutor,
  organizationId: string,
  movement: { sessionId: string; amount: number; note: string; createdBy: string },
): Promise<void> {
  await db.query(
    `insert into cash_movements (movement_id, organization_id, session_id, kind, amount, note, created_by)
     values ($1, $2, $3, 'bank_deposit', $4, $5, $6)`,
    [newId('mov'), organizationId, movement.sessionId, movement.amount, movement.note, movement.createdBy],
  );
}

/** Says which till a cash payment went into, or came out of. */
export async function attachPayment(
  db: SqlExecutor,
  paymentId: string,
  sessionId: string,
): Promise<void> {
  await db.query(`update payments set cash_session_id = $2 where payment_id = $1`, [
    paymentId,
    sessionId,
  ]);
}

// ── Expenses and draws ────────────────────────────────────────────────────────────────────────

type ExpenseRow = {
  expense_id: string;
  spent_on: string;
  label: string;
  category: ExpenseCategory;
  behavior: Behavior;
  amount: number;
  paid_from: PaidFrom;
  site_id: string | null;
  recurring: boolean;
  stopped_on: string | null;
  voided: boolean;
  void_reason: string;
};

const expenseColumns = `expense_id, to_char(spent_on, 'YYYY-MM-DD') as spent_on, label, category,
  behavior, amount, paid_from, site_id, recurring, to_char(stopped_on, 'YYYY-MM-DD') as stopped_on,
  voided_at is not null as voided, void_reason`;

const toExpense = (row: ExpenseRow): Expense => ({
  expenseId: row.expense_id,
  spentOn: row.spent_on,
  label: row.label,
  category: row.category,
  behavior: row.behavior,
  amount: row.amount,
  paidFrom: row.paid_from,
  siteId: row.site_id,
  recurring: row.recurring,
  stoppedOn: row.stopped_on,
  voided: row.voided,
  voidReason: row.void_reason,
});

/**
 * The expenses that may count in a period: those dated in it, and the recurring ones that started
 * before its end. `occurrences` (domain) says how many times each one counts.
 */
export async function listExpenses(
  db: SqlExecutor,
  period: { from: string; to: string },
): Promise<Expense[]> {
  const { rows } = await db.query<ExpenseRow>(
    `select ${expenseColumns} from expenses
      where (not recurring and spent_on >= $1::date and spent_on < $2::date)
         or (recurring and spent_on < $2::date
             and (stopped_on is null or stopped_on >= date_trunc('month', $1::date)))
      order by recurring desc, spent_on desc, created_at desc`,
    [period.from, period.to],
  );
  return rows.map(toExpense);
}

export const asCharge = (expense: Expense): Charge => ({
  spentOn: expense.spentOn,
  amount: expense.amount,
  behavior: expense.behavior,
  recurring: expense.recurring,
  stoppedOn: expense.stoppedOn,
  voided: expense.voided,
});

export async function findExpense(db: SqlExecutor, expenseId: string): Promise<Expense | null> {
  const { rows } = await db.query<ExpenseRow>(
    `select ${expenseColumns} from expenses where expense_id = $1`,
    [expenseId],
  );
  return rows[0] ? toExpense(rows[0]) : null;
}

export async function insertExpense(
  db: SqlExecutor,
  organizationId: string,
  expense: Omit<Expense, 'expenseId' | 'stoppedOn' | 'voided' | 'voidReason'> & {
    cashSessionId: string | null;
    createdBy: string;
  },
): Promise<string> {
  const expenseId = newId('exp');
  await db.query(
    `insert into expenses (expense_id, organization_id, site_id, spent_on, label, category, behavior,
                           amount, paid_from, cash_session_id, recurring, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      expenseId,
      organizationId,
      expense.siteId,
      expense.spentOn,
      expense.label,
      expense.category,
      expense.behavior,
      expense.amount,
      expense.paidFrom,
      expense.cashSessionId,
      expense.recurring,
      expense.createdBy,
    ],
  );
  return expenseId;
}

export async function voidExpense(db: SqlExecutor, expenseId: string, reason: string): Promise<void> {
  await db.query(
    `update expenses set voided_at = now(), void_reason = $2 where expense_id = $1`,
    [expenseId, reason],
  );
}

export async function stopExpense(db: SqlExecutor, expenseId: string, stoppedOn: string): Promise<void> {
  await db.query(`update expenses set stopped_on = $2 where expense_id = $1`, [expenseId, stoppedOn]);
}

export async function listDraws(
  db: SqlExecutor,
  period: { from: string; to: string },
): Promise<OwnerDraw[]> {
  const { rows } = await db.query<{
    draw_id: string;
    drawn_on: string;
    amount: number;
    paid_from: PaidFrom;
    note: string;
  }>(
    `select draw_id, to_char(drawn_on, 'YYYY-MM-DD') as drawn_on, amount, paid_from, note
       from owner_draws where drawn_on >= $1::date and drawn_on < $2::date
      order by drawn_on desc, created_at desc`,
    [period.from, period.to],
  );
  return rows.map((row) => ({
    drawId: row.draw_id,
    drawnOn: row.drawn_on,
    amount: row.amount,
    paidFrom: row.paid_from,
    note: row.note,
  }));
}

export async function insertDraw(
  db: SqlExecutor,
  organizationId: string,
  draw: Omit<OwnerDraw, 'drawId'> & {
    siteId: string | null;
    cashSessionId: string | null;
    createdBy: string;
  },
): Promise<string> {
  const drawId = newId('drw');
  await db.query(
    `insert into owner_draws (draw_id, organization_id, site_id, drawn_on, amount, paid_from,
                              cash_session_id, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      drawId,
      organizationId,
      draw.siteId,
      draw.drawnOn,
      draw.amount,
      draw.paidFrom,
      draw.cashSessionId,
      draw.note,
      draw.createdBy,
    ],
  );
  return drawId;
}

// ── Costs ─────────────────────────────────────────────────────────────────────────────────────

export interface StoredSheet extends CostSheet {
  measuredOn: string;
}

export async function listSheets(db: SqlExecutor): Promise<StoredSheet[]> {
  const { rows } = await db.query<{
    service_id: string;
    article_id: string | null;
    labor_minutes: string;
    consumables_cost: string;
    machine_cost: string;
    measured: boolean;
    measured_on: string;
  }>(
    `select service_id, article_id, labor_minutes, consumables_cost, machine_cost, measured,
            to_char(measured_on, 'YYYY-MM-DD') as measured_on
       from cost_sheets`,
  );
  return rows.map((row) => ({
    serviceId: row.service_id,
    articleId: row.article_id,
    laborMinutes: Number(row.labor_minutes),
    consumablesCost: Number(row.consumables_cost),
    machineCost: Number(row.machine_cost),
    measured: row.measured,
    measuredOn: row.measured_on,
  }));
}

export async function saveSheet(
  db: SqlExecutor,
  organizationId: string,
  sheet: CostSheet & { updatedBy: string },
): Promise<void> {
  await db.query(
    `delete from cost_sheets where service_id = $1 and coalesce(article_id, '') = coalesce($2, '')`,
    [sheet.serviceId, sheet.articleId],
  );
  await db.query(
    `insert into cost_sheets (sheet_id, organization_id, service_id, article_id, labor_minutes,
                              consumables_cost, machine_cost, measured, updated_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId('cst'),
      organizationId,
      sheet.serviceId,
      sheet.articleId,
      sheet.laborMinutes,
      sheet.consumablesCost,
      sheet.machineCost,
      sheet.measured,
      sheet.updatedBy,
    ],
  );
}

/** Payments minus refunds of a period: what was really cashed. */
export async function cashedIn(db: SqlExecutor, period: { from: string; to: string }): Promise<number> {
  const { rows } = await db.query<{ cashed: string }>(
    `select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) as cashed
       from payments where created_at >= $1::date and created_at < $2::date`,
    [period.from, period.to],
  );
  return Number(rows[0]?.cashed ?? 0);
}

/** The real content of the deposits received in a period (cancelled ones apart), line by line. */
export async function periodContent(
  db: SqlExecutor,
  period: { from: string; to: string },
): Promise<{ lines: CostedLine[]; packSales: PackSale[]; orders: number; belowCost: number }> {
  const { rows } = await db.query<{
    order_id: string;
    pack_name: string | null;
    pack_price: number;
    below_cost: boolean;
    service_id: string;
    article_id: string | null;
    quantity: string;
    covered: string;
  }>(
    `select o.order_id, o.pack_name, o.pack_price, o.below_cost, i.service_id, i.article_id,
            i.quantity, i.covered
       from orders o join order_items i using (order_id)
      where o.created_at >= $1::date and o.created_at < $2::date and o.status <> 'cancelled'
      order by o.created_at, i.position`,
    [period.from, period.to],
  );
  const lines: CostedLine[] = [];
  const sales = new Map<string, PackSale>();
  const orders = new Set<string>();
  const below = new Set<string>();
  for (const row of rows) {
    const line: CostedLine = {
      serviceId: row.service_id,
      articleId: row.article_id,
      quantity: Number(row.quantity),
      covered: Number(row.covered),
    };
    lines.push(line);
    orders.add(row.order_id);
    if (row.below_cost) below.add(row.order_id);
    if (row.pack_name) {
      const sale = sales.get(row.order_id) ?? {
        packName: row.pack_name,
        packPrice: row.pack_price,
        lines: [],
      };
      sale.lines.push(line);
      sales.set(row.order_id, sale);
    }
  }
  return { lines, packSales: [...sales.values()], orders: orders.size, belowCost: below.size };
}

/** Marks a deposit as sold under the variable cost of its content (the guard-rail). */
export async function flagBelowCost(db: SqlExecutor, orderId: string): Promise<void> {
  await db.query(`update orders set below_cost = true where order_id = $1`, [orderId]);
}
