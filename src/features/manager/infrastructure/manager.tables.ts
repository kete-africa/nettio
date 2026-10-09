import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { ApprovalKind, ComplaintKind, Shift, StorageRules } from '../domain/manager';

// The manager's tables (specs/025-manager), each with its row-level security in this migration.

export function managerMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
create table ${s}.shifts (
  organization_id text not null,
  user_id text not null,
  weekday integer not null check (weekday between 0 and 6),
  start_minute integer not null check (start_minute between 0 and 1439),
  end_minute integer not null check (end_minute between 1 and 1440 and end_minute > start_minute),
  primary key (organization_id, user_id, weekday)
);
${secure('shifts', 'select, insert, update, delete')}

-- What a clerk asked a manager for: decided once, never rewritten.
create table ${s}.approvals (
  approval_id text primary key,
  organization_id text not null,
  kind text not null check (kind in ('discount', 'cancel', 'refund')),
  order_id text not null references ${s}.orders (order_id),
  amount integer not null default 0 check (amount >= 0),
  method text not null default '',
  reason text not null check (length(reason) between 1 and 300),
  status text not null default 'pending' check (status in ('pending', 'approved', 'refused')),
  requested_by text not null,
  requested_at timestamptz not null default clock_timestamp(),
  decided_by text,
  decided_at timestamptz,
  note text not null default '',
  -- The short number a manager answers by message: « OUI 12 » (unique in the laundry).
  reply_code integer not null,
  -- When those who decide were told by message; null while it waits to be said.
  notified_at timestamptz,
  unique (organization_id, reply_code)
);
create index approvals_pending on ${s}.approvals (organization_id, requested_at) where status = 'pending';
${secure('approvals', 'select, insert, update')}

create table ${s}.complaints (
  complaint_id text primary key,
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  kind text not null check (kind in ('damage', 'loss', 'stain', 'delay', 'other')),
  description text not null check (length(description) between 1 and 1000),
  status text not null default 'open' check (status in ('open', 'resolved')),
  -- What the laundry decided to give: said here; the money itself moves by a refund or an expense.
  compensation integer not null default 0 check (compensation >= 0),
  resolution text not null default '',
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  resolved_by text,
  resolved_at timestamptz
);
create index complaints_open on ${s}.complaints (organization_id, created_at) where status = 'open';
${secure('complaints', 'select, insert, update')}

-- The laundry's own rules for deposits that sleep, and whether a shared device may switch person.
create table ${s}.manager_rules (
  organization_id text primary key,
  storage_free_days integer not null default 30 check (storage_free_days between 0 and 365),
  storage_fee_per_day integer not null default 0 check (storage_fee_per_day between 0 and 100000),
  abandon_days integer not null default 90 check (abandon_days between 7 and 730),
  quick_switch boolean not null default false,
  updated_at timestamptz not null default now()
);
${secure('manager_rules', 'select, insert, update')}

create table ${s}.storage_fees (
  fee_id text primary key,
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  days integer not null check (days > 0),
  amount integer not null check (amount > 0),
  applied_by text not null,
  applied_at timestamptz not null default clock_timestamp()
);
create index storage_fees_by_order on ${s}.storage_fees (order_id);
${secure('storage_fees', 'select, insert')}

-- The warning sent before a deposit leaves the laundry, and where it went.
create table ${s}.abandon_notices (
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  noticed_by text not null,
  noticed_at timestamptz not null default clock_timestamp(),
  released_at timestamptz,
  released_by text,
  destination text not null default '',
  primary key (organization_id, order_id)
);
${secure('abandon_notices', 'select, insert, update')}

-- A person's code for a shared device: only its salted hash is kept.
create table ${s}.staff_codes (
  organization_id text not null,
  user_id text not null,
  code_hash text not null,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
${secure('staff_codes', 'select, insert, update')}
`;
}

// ── Schedules ────────────────────────────────────────────────────────────────────────────────

export async function listShifts(db: SqlExecutor, userId?: string): Promise<Shift[]> {
  const { rows } = await db.query<{ user_id: string; weekday: number; start_minute: number; end_minute: number }>(
    `select user_id, weekday, start_minute, end_minute from shifts
      where ($1::text is null or user_id = $1) order by user_id, weekday`,
    [userId ?? null],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    weekday: row.weekday,
    startMinute: row.start_minute,
    endMinute: row.end_minute,
  }));
}

/** Replaces a person's week: the days given are her hours, the others are days off. */
export async function saveWeek(
  db: SqlExecutor,
  organizationId: string,
  userId: string,
  days: { weekday: number; startMinute: number; endMinute: number }[],
): Promise<void> {
  await db.query(`delete from shifts where user_id = $1`, [userId]);
  for (const day of days) {
    await db.query(
      `insert into shifts (organization_id, user_id, weekday, start_minute, end_minute)
       values ($1, $2, $3, $4, $5)`,
      [organizationId, userId, day.weekday, day.startMinute, day.endMinute],
    );
  }
}

// ── Approvals ────────────────────────────────────────────────────────────────────────────────

export interface Approval {
  approvalId: string;
  kind: ApprovalKind;
  orderId: string;
  orderNumber: string;
  customerName: string;
  amount: number;
  method: string;
  reason: string;
  status: 'pending' | 'approved' | 'refused';
  requestedBy: string;
  requestedAt: Date;
  note: string;
  /** The number a manager answers by message. */
  replyCode: number;
}

type ApprovalRow = {
  approval_id: string;
  kind: ApprovalKind;
  order_id: string;
  number: string;
  customer_name: string;
  amount: number;
  method: string;
  reason: string;
  status: Approval['status'];
  requested_by: string;
  requested_at: Date;
  note: string;
  reply_code: number;
};

const APPROVAL_SELECT = `
  select a.approval_id, a.kind, a.order_id, o.number, c.name as customer_name, a.amount, a.method,
         a.reason, a.status, a.requested_by, a.requested_at, a.note, a.reply_code
    from approvals a join orders o on o.order_id = a.order_id
    join customers c on c.customer_id = o.customer_id`;

const toApproval = (row: ApprovalRow): Approval => ({
  approvalId: row.approval_id,
  kind: row.kind,
  orderId: row.order_id,
  orderNumber: row.number,
  customerName: row.customer_name,
  amount: row.amount,
  method: row.method,
  reason: row.reason,
  status: row.status,
  requestedBy: row.requested_by,
  requestedAt: row.requested_at,
  note: row.note,
  replyCode: row.reply_code,
});

export async function insertApproval(
  db: SqlExecutor,
  organizationId: string,
  request: { kind: ApprovalKind; orderId: string; amount: number; method: string; reason: string; requestedBy: string },
): Promise<string> {
  const approvalId = newId('apr');
  await db.query(
    `insert into approvals (approval_id, organization_id, kind, order_id, amount, method, reason, requested_by,
                            reply_code)
     values ($1, $2, $3, $4, $5, $6, $7, $8, (select coalesce(max(reply_code), 0) + 1 from approvals))`,
    [approvalId, organizationId, request.kind, request.orderId, request.amount, request.method, request.reason, request.requestedBy],
  );
  return approvalId;
}

export async function listApprovals(
  db: SqlExecutor,
  filter: { pendingOnly: boolean; requestedBy?: string | undefined },
): Promise<Approval[]> {
  const { rows } = await db.query<ApprovalRow>(
    `${APPROVAL_SELECT}
      where ($1::boolean is false or a.status = 'pending') and ($2::text is null or a.requested_by = $2)
      order by a.requested_at desc limit 100`,
    [filter.pendingOnly, filter.requestedBy ?? null],
  );
  return rows.map(toApproval);
}

/** The pending requests those who decide were not told about yet: locked, to be told once. */
export async function approvalsToTell(db: SqlExecutor): Promise<Approval[]> {
  const { rows } = await db.query<ApprovalRow>(
    `${APPROVAL_SELECT} where a.status = 'pending' and a.notified_at is null
      order by a.requested_at limit 20 for update of a skip locked`,
  );
  return rows.map(toApproval);
}

export async function markTold(db: SqlExecutor, approvalIds: string[]): Promise<void> {
  await db.query(`update approvals set notified_at = clock_timestamp() where approval_id = any($1::text[])`, [
    approvalIds,
  ]);
}

/** The pending request a manager names by its number in a message. */
export async function pendingByCode(db: SqlExecutor, replyCode: number): Promise<Approval | null> {
  const { rows } = await db.query<ApprovalRow>(
    `${APPROVAL_SELECT} where a.reply_code = $1 and a.status = 'pending'`,
    [replyCode],
  );
  return rows[0] ? toApproval(rows[0]) : null;
}

/** The request, locked until it is decided; null when it does not exist. */
export async function lockApproval(db: SqlExecutor, approvalId: string): Promise<Approval | null> {
  const { rows } = await db.query<ApprovalRow>(`${APPROVAL_SELECT} where a.approval_id = $1 for update of a`, [approvalId]);
  return rows[0] ? toApproval(rows[0]) : null;
}

export async function decideApproval(
  db: SqlExecutor,
  approvalId: string,
  decision: { status: 'approved' | 'refused'; decidedBy: string; note: string },
): Promise<void> {
  await db.query(
    `update approvals set status = $2, decided_by = $3, decided_at = clock_timestamp(), note = $4
      where approval_id = $1 and status = 'pending'`,
    [approvalId, decision.status, decision.decidedBy, decision.note],
  );
}

/** The deposit a request is about, with its discount: locked. */
export async function orderForApproval(
  db: SqlExecutor,
  orderId: string,
): Promise<{ status: string; total: number; paid: number; discount: number; number: string } | null> {
  const { rows } = await db.query<{ status: string; total: number; paid: number; discount: number; number: string }>(
    `select status, total, paid, discount, number from orders where order_id = $1 for update`,
    [orderId],
  );
  return rows[0] ?? null;
}

/** Grants a discount on a deposit already received: its price follows, to the franc. */
export async function grantDiscount(
  db: SqlExecutor,
  orderId: string,
  discount: number,
  reason: string,
): Promise<void> {
  await db.query(
    `update orders set total = total + discount - $2, discount = $2, discount_reason = $3
      where order_id = $1`,
    [orderId, discount, reason],
  );
}

// ── Complaints ───────────────────────────────────────────────────────────────────────────────

export interface Complaint {
  complaintId: string;
  orderId: string;
  orderNumber: string;
  customerName: string;
  kind: ComplaintKind;
  description: string;
  status: 'open' | 'resolved';
  compensation: number;
  resolution: string;
  createdAt: Date;
  resolvedAt: Date | null;
}

type ComplaintRow = {
  complaint_id: string;
  order_id: string;
  number: string;
  customer_name: string;
  kind: ComplaintKind;
  description: string;
  status: Complaint['status'];
  compensation: number;
  resolution: string;
  created_at: Date;
  resolved_at: Date | null;
};

export async function insertComplaint(
  db: SqlExecutor,
  organizationId: string,
  complaint: { orderId: string; kind: ComplaintKind; description: string; createdBy: string },
): Promise<string> {
  const complaintId = newId('cpl');
  await db.query(
    `insert into complaints (complaint_id, organization_id, order_id, kind, description, created_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [complaintId, organizationId, complaint.orderId, complaint.kind, complaint.description, complaint.createdBy],
  );
  return complaintId;
}

export async function listComplaints(
  db: SqlExecutor,
  filter: { openOnly: boolean; orderId?: string | undefined },
): Promise<Complaint[]> {
  const { rows } = await db.query<ComplaintRow>(
    `select k.complaint_id, k.order_id, o.number, c.name as customer_name, k.kind, k.description, k.status,
            k.compensation, k.resolution, k.created_at, k.resolved_at
       from complaints k join orders o on o.order_id = k.order_id
       join customers c on c.customer_id = o.customer_id
      where ($1::boolean is false or k.status = 'open') and ($2::text is null or k.order_id = $2)
      order by k.created_at desc limit 100`,
    [filter.openOnly, filter.orderId ?? null],
  );
  return rows.map((row) => ({
    complaintId: row.complaint_id,
    orderId: row.order_id,
    orderNumber: row.number,
    customerName: row.customer_name,
    kind: row.kind,
    description: row.description,
    status: row.status,
    compensation: row.compensation,
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }));
}

/** Closes a complaint with what was decided; false when it was not open. */
export async function resolveComplaint(
  db: SqlExecutor,
  complaintId: string,
  outcome: { resolution: string; compensation: number; resolvedBy: string },
): Promise<boolean> {
  const { rows } = await db.query<{ complaint_id: string }>(
    `update complaints set status = 'resolved', resolution = $2, compensation = $3, resolved_by = $4,
            resolved_at = clock_timestamp()
      where complaint_id = $1 and status = 'open' returning complaint_id`,
    [complaintId, outcome.resolution, outcome.compensation, outcome.resolvedBy],
  );
  return rows.length > 0;
}

// ── Rules, unclaimed deposits ────────────────────────────────────────────────────────────────

export interface ManagerRules extends StorageRules {
  quickSwitch: boolean;
}

export async function readRules(db: SqlExecutor): Promise<ManagerRules> {
  const { rows } = await db.query<{
    storage_free_days: number;
    storage_fee_per_day: number;
    abandon_days: number;
    quick_switch: boolean;
  }>(`select storage_free_days, storage_fee_per_day, abandon_days, quick_switch from manager_rules`);
  const row = rows[0];
  return {
    freeDays: row?.storage_free_days ?? 30,
    feePerDay: row?.storage_fee_per_day ?? 0,
    abandonDays: row?.abandon_days ?? 90,
    quickSwitch: row?.quick_switch ?? false,
  };
}

export async function saveRules(db: SqlExecutor, organizationId: string, rules: ManagerRules): Promise<void> {
  await db.query(
    `insert into manager_rules (organization_id, storage_free_days, storage_fee_per_day, abandon_days, quick_switch)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id) do update
       set storage_free_days = $2, storage_fee_per_day = $3, abandon_days = $4, quick_switch = $5,
           updated_at = now()`,
    [organizationId, rules.freeDays, rules.feePerDay, rules.abandonDays, rules.quickSwitch],
  );
}

export interface SleepingDeposit {
  orderId: string;
  number: string;
  customerName: string;
  readyAt: Date;
  total: number;
  paid: number;
  charged: number;
  noticedAt: Date | null;
  invoiced: boolean;
}

/** The ready deposits, the oldest first, with what was already charged and whether a notice left. */
export async function sleepingDeposits(db: SqlExecutor, orderId?: string): Promise<SleepingDeposit[]> {
  const { rows } = await db.query<{
    order_id: string;
    number: string;
    customer_name: string;
    ready_at: Date;
    total: number;
    paid: number;
    charged: number;
    noticed_at: Date | null;
    invoiced: boolean;
  }>(
    `select o.order_id, o.number, c.name as customer_name, o.ready_at, o.total, o.paid,
            o.storage_amount as charged,
            n.noticed_at,
            exists (select 1 from invoice_orders l where l.order_id = o.order_id) as invoiced
       from orders o join customers c on c.customer_id = o.customer_id
       left join abandon_notices n on n.order_id = o.order_id
      where o.status = 'ready' and o.ready_at is not null and ($1::text is null or o.order_id = $1)
      order by o.ready_at limit 200`,
    [orderId ?? null],
  );
  return rows.map((row) => ({
    orderId: row.order_id,
    number: row.number,
    customerName: row.customer_name,
    readyAt: row.ready_at,
    total: row.total,
    paid: row.paid,
    charged: row.charged,
    noticedAt: row.noticed_at,
    invoiced: row.invoiced,
  }));
}

/** Adds a storage fee to a deposit: its price grows by it, and the fee keeps its trace. */
export async function chargeStorage(
  db: SqlExecutor,
  organizationId: string,
  fee: { orderId: string; days: number; amount: number; appliedBy: string },
): Promise<void> {
  await db.query(
    `insert into storage_fees (fee_id, organization_id, order_id, days, amount, applied_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [newId('stf'), organizationId, fee.orderId, fee.days, fee.amount, fee.appliedBy],
  );
  await db.query(
    `update orders set total = total + $2, storage_amount = storage_amount + $2 where order_id = $1`,
    [fee.orderId, fee.amount],
  );
}

/** Notes that the customer was warned; false when she already was. */
export async function noteNotice(
  db: SqlExecutor,
  organizationId: string,
  notice: { orderId: string; noticedBy: string },
): Promise<boolean> {
  const { rows } = await db.query<{ order_id: string }>(
    `insert into abandon_notices (organization_id, order_id, noticed_by) values ($1, $2, $3)
     on conflict (organization_id, order_id) do nothing returning order_id`,
    [organizationId, notice.orderId, notice.noticedBy],
  );
  return rows.length > 0;
}

/**
 * The deposit leaves the laundry: its notice says where it went, and it is closed. What was paid
 * stays earned; what was still owed is given up — written as a discount, with where the clothes
 * went as its reason — so that nothing stays « owed » forever on clothes that are gone.
 */
export async function releaseDeposit(
  db: SqlExecutor,
  release: { orderId: string; destination: string; releasedBy: string },
): Promise<void> {
  await db.query(
    `update abandon_notices set released_at = clock_timestamp(), released_by = $3, destination = $2
      where order_id = $1`,
    [release.orderId, release.destination, release.releasedBy],
  );
  await db.query(
    `update orders
        set status = 'collected', collected_at = clock_timestamp(),
            discount = discount + (total - paid),
            discount_reason = case when total > paid then $2 else discount_reason end,
            total = paid
      where order_id = $1`,
    [release.orderId, release.destination],
  );
}

// ── Personal codes ───────────────────────────────────────────────────────────────────────────

const hashOf = (code: string, salt: Buffer): string =>
  `${salt.toString('hex')}:${scryptSync(code, salt, 32).toString('hex')}`;

export async function saveCode(db: SqlExecutor, organizationId: string, userId: string, code: string): Promise<void> {
  await db.query(
    `insert into staff_codes (organization_id, user_id, code_hash) values ($1, $2, $3)
     on conflict (organization_id, user_id) do update
       set code_hash = $3, failures = 0, locked_until = null, updated_at = now()`,
    [organizationId, userId, hashOf(code, randomBytes(16))],
  );
}

export async function hasCode(db: SqlExecutor, userId: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from staff_codes where user_id = $1`, [userId]);
  return rows.length > 0;
}

/** Who set a code: the people a shared device may switch to. */
export async function peopleWithCode(db: SqlExecutor): Promise<string[]> {
  const { rows } = await db.query<{ user_id: string }>(`select user_id from staff_codes`);
  return rows.map((row) => row.user_id);
}

/**
 * Checks a person's code. A wrong code counts; after `maxFailures` the code is locked for a
 * while — a four-finger guess on a shared device must not open the owner's rights.
 */
export async function verifyCode(
  db: SqlExecutor,
  userId: string,
  code: string,
  limits: { maxFailures: number; lockMinutes: number },
): Promise<'ok' | 'wrong' | 'locked' | 'none'> {
  const { rows } = await db.query<{ code_hash: string; failures: number; locked: boolean }>(
    `select code_hash, failures, coalesce(locked_until > now(), false) as locked
       from staff_codes where user_id = $1 for update`,
    [userId],
  );
  const row = rows[0];
  if (!row) return 'none';
  if (row.locked) return 'locked';
  const [salt = '', stored = ''] = row.code_hash.split(':');
  const given = Buffer.from(scryptSync(code, Buffer.from(salt, 'hex'), 32));
  const expected = Buffer.from(stored, 'hex');
  if (given.length === expected.length && timingSafeEqual(given, expected)) {
    await db.query(`update staff_codes set failures = 0, locked_until = null where user_id = $1`, [userId]);
    return 'ok';
  }
  const failures = row.failures + 1;
  await db.query(
    `update staff_codes
        set failures = case when $2::integer >= $3::integer then 0 else $2::integer end,
            locked_until = case when $2::integer >= $3::integer
                                then now() + make_interval(mins => $4::integer) else null end
      where user_id = $1`,
    [userId, failures, limits.maxFailures, limits.lockMinutes],
  );
  return failures >= limits.maxFailures ? 'locked' : 'wrong';
}
