import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { OrderStatus, PaymentKind, PaymentMethod } from '../domain/order';
import type { Order, OrderEvent, OrderItem, OrderSummary, Payment } from '../order.record';

/** The deposits' tables, each with its row-level security in the same migration. */
export function ordersMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
create table ${s}.orders (
  order_id text primary key,
  organization_id text not null,
  site_id text not null references ${s}.sites (site_id),
  number text not null,
  customer_id text not null references ${s}.customers (customer_id),
  status text not null default 'received'
    check (status in ('received', 'in_progress', 'ready', 'collected', 'cancelled')),
  express boolean not null default false,
  -- The pack as it was sold: a later change of the catalogue never touches a past deposit.
  pack_id text,
  pack_name text,
  pack_price integer not null default 0 check (pack_price >= 0),
  pieces integer not null default 0 check (pieces >= 0),
  kilos numeric(10, 3) not null default 0 check (kilos >= 0),
  subtotal integer not null check (subtotal >= 0),
  supplement integer not null default 0 check (supplement >= 0),
  express_amount integer not null default 0 check (express_amount >= 0),
  discount integer not null default 0 check (discount >= 0),
  discount_reason text not null default '',
  total integer not null check (total >= 0),
  paid integer not null default 0 check (paid >= 0 and paid <= total),
  promised_at timestamptz not null,
  note text not null default '',
  location text not null default '',
  cancel_reason text not null default '',
  created_by text not null,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  collected_at timestamptz,
  cancelled_at timestamptz,
  unique (organization_id, number)
);
create index orders_by_status on ${s}.orders (organization_id, status, promised_at);
create index orders_by_day on ${s}.orders (organization_id, created_at);
create index orders_by_customer on ${s}.orders (organization_id, customer_id, created_at);
${secure('orders', 'select, insert, update')}

create table ${s}.order_items (
  item_id text primary key,
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  position integer not null,
  service_id text not null,
  service_name text not null,
  article_id text,
  article_name text,
  pricing text not null check (pricing in ('per_piece', 'per_kg')),
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  amount integer not null check (amount >= 0),
  covered numeric(10, 3) not null default 0 check (covered >= 0),
  due integer not null check (due >= 0),
  defects text not null default ''
);
create index order_items_by_order on ${s}.order_items (order_id, position);
${secure('order_items', 'select, insert')}

-- Money is never deleted nor changed: an error is corrected by a reasoned refund.
create table ${s}.payments (
  payment_id text primary key,
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  site_id text not null references ${s}.sites (site_id),
  amount integer not null check (amount > 0),
  method text not null check (method in ('cash', 'mobile_money', 'card', 'transfer')),
  kind text not null check (kind in ('deposit', 'balance', 'refund')),
  reason text not null default '',
  created_by text not null,
  created_at timestamptz not null default now()
);
create index payments_by_day on ${s}.payments (organization_id, created_at);
create index payments_by_order on ${s}.payments (order_id, created_at);
${secure('payments', 'select, insert')}

-- The history of a deposit: every gesture, dated and signed. Appended, never changed.
create table ${s}.order_events (
  event_id text primary key,
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  kind text not null,
  detail jsonb not null default '{}',
  actor_id text not null,
  actor_kind text not null,
  at timestamptz not null default now()
);
create index order_events_by_order on ${s}.order_events (order_id, at);
${secure('order_events', 'select, insert')}
`;
}

/** Takes the next number of a site: its own series, never skipped (the row is locked). */
export async function takeNumber(
  db: SqlExecutor,
  siteId: string,
): Promise<{ seq: number; code: string } | null> {
  const { rows } = await db.query<{ seq: number; code: string }>(
    `update sites set next_order_seq = next_order_seq + 1
      where site_id = $1 returning next_order_seq - 1 as seq, code`,
    [siteId],
  );
  return rows[0] ?? null;
}

export interface NewOrder {
  siteId: string;
  number: string;
  customerId: string;
  express: boolean;
  packId: string | null;
  packName: string | null;
  packPrice: number;
  pieces: number;
  kilos: number;
  subtotal: number;
  supplement: number;
  expressAmount: number;
  discount: number;
  discountReason: string;
  total: number;
  promisedAt: Date;
  note: string;
  createdBy: string;
  items: Omit<OrderItem, 'itemId'>[];
}

export async function insertOrder(
  db: SqlExecutor,
  organizationId: string,
  order: NewOrder,
): Promise<string> {
  const orderId = newId('ord');
  await db.query(
    `insert into orders (order_id, organization_id, site_id, number, customer_id, express, pack_id,
                         pack_name, pack_price, pieces, kilos, subtotal, supplement, express_amount,
                         discount, discount_reason, total, promised_at, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)`,
    [
      orderId,
      organizationId,
      order.siteId,
      order.number,
      order.customerId,
      order.express,
      order.packId,
      order.packName,
      order.packPrice,
      order.pieces,
      order.kilos,
      order.subtotal,
      order.supplement,
      order.expressAmount,
      order.discount,
      order.discountReason,
      order.total,
      order.promisedAt,
      order.note,
      order.createdBy,
    ],
  );
  // The lines in one statement: a deposit of thirty lines costs one round trip.
  await db.query(
    `insert into order_items (item_id, organization_id, order_id, position, service_id,
                              service_name, article_id, article_name, pricing, quantity, unit_price,
                              amount, covered, due, defects)
     select t.item_id, $1, $2, t.position::int - 1, t.service_id, t.service_name, t.article_id,
            t.article_name, t.pricing, t.quantity, t.unit_price, t.amount, t.covered, t.due,
            t.defects
       from unnest($3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                   $9::numeric[], $10::int[], $11::int[], $12::numeric[], $13::int[], $14::text[])
            with ordinality as t (item_id, service_id, service_name, article_id, article_name,
                                  pricing, quantity, unit_price, amount, covered, due, defects,
                                  position)`,
    [
      organizationId,
      orderId,
      order.items.map(() => newId('itm')),
      order.items.map((item) => item.serviceId),
      order.items.map((item) => item.serviceName),
      order.items.map((item) => item.articleId),
      order.items.map((item) => item.articleName),
      order.items.map((item) => item.pricing),
      order.items.map((item) => item.quantity),
      order.items.map((item) => item.unitPrice),
      order.items.map((item) => item.amount),
      order.items.map((item) => item.covered),
      order.items.map((item) => item.due),
      order.items.map((item) => item.defects),
    ],
  );
  return orderId;
}

/** Appends a line to a deposit's history. */
export async function noteEvent(
  db: SqlExecutor,
  organizationId: string,
  event: {
    orderId: string;
    kind: string;
    detail?: Record<string, unknown>;
    actor: { id: string; kind: string };
  },
): Promise<void> {
  await db.query(
    `insert into order_events (event_id, organization_id, order_id, kind, detail, actor_id, actor_kind)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      newId('oev'),
      organizationId,
      event.orderId,
      event.kind,
      JSON.stringify(event.detail ?? {}),
      event.actor.id,
      event.actor.kind,
    ],
  );
}

/** Writes a payment (or a refund) and keeps the deposit's « paid » true, in the same transaction. */
export async function insertPayment(
  db: SqlExecutor,
  organizationId: string,
  payment: {
    orderId: string;
    siteId: string;
    amount: number;
    method: PaymentMethod;
    kind: PaymentKind;
    reason?: string;
    createdBy: string;
  },
): Promise<string> {
  const paymentId = newId('pay');
  await db.query(
    `insert into payments (payment_id, organization_id, order_id, site_id, amount, method, kind,
                           reason, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      paymentId,
      organizationId,
      payment.orderId,
      payment.siteId,
      payment.amount,
      payment.method,
      payment.kind,
      payment.reason ?? '',
      payment.createdBy,
    ],
  );
  await db.query(`update orders set paid = paid + $2 where order_id = $1`, [
    payment.orderId,
    payment.kind === 'refund' ? -payment.amount : payment.amount,
  ]);
  return paymentId;
}

export async function setStatus(
  db: SqlExecutor,
  orderId: string,
  status: OrderStatus,
  fields: { location?: string; cancelReason?: string } = {},
): Promise<void> {
  await db.query(
    `update orders set status = $2,
            ready_at = case when $2 = 'ready' then now() else ready_at end,
            collected_at = case when $2 = 'collected' then now() else collected_at end,
            cancelled_at = case when $2 = 'cancelled' then now() else cancelled_at end,
            location = coalesce($3, location),
            cancel_reason = coalesce($4, cancel_reason)
      where order_id = $1`,
    [orderId, status, fields.location ?? null, fields.cancelReason ?? null],
  );
}

/** Says where a deposit is stored, for whoever hands it over. */
export async function setLocation(db: SqlExecutor, orderId: string, location: string): Promise<void> {
  await db.query(`update orders set location = $2 where order_id = $1`, [orderId, location]);
}

type SummaryRow = {
  order_id: string;
  number: string;
  site_id: string;
  customer_id: string;
  customer_name: string;
  status: OrderStatus;
  express: boolean;
  pieces: number;
  total: number;
  paid: number;
  promised_at: Date;
  created_at: Date;
};

const summaryColumns = `o.order_id, o.number, o.site_id, o.customer_id, c.name as customer_name,
  o.status, o.express, o.pieces, o.total, o.paid, o.promised_at, o.created_at`;

const toSummary = (row: SummaryRow): OrderSummary => ({
  orderId: row.order_id,
  number: row.number,
  siteId: row.site_id,
  customerId: row.customer_id,
  customerName: row.customer_name,
  status: row.status,
  express: row.express,
  pieces: row.pieces,
  total: row.total,
  paid: row.paid,
  promisedAt: row.promised_at,
  createdAt: row.created_at,
});

export interface OrderQuery {
  /** The deposits to show: still to process, ready, over, or all. */
  stage?: 'open' | 'ready' | 'closed' | 'all' | undefined;
  siteId?: string | undefined;
  customerId?: string | undefined;
  /** A number, a name or a phone. */
  text?: string | undefined;
  limit: number;
}

const stages: Record<NonNullable<OrderQuery['stage']>, OrderStatus[]> = {
  open: ['received', 'in_progress'],
  ready: ['ready'],
  closed: ['collected', 'cancelled'],
  all: ['received', 'in_progress', 'ready', 'collected', 'cancelled'],
};

/** Deposits by stage, the soonest promised first while open, the latest first once over. */
export async function listOrders(db: SqlExecutor, query: OrderQuery): Promise<OrderSummary[]> {
  const stage = query.stage ?? 'all';
  const text = query.text?.trim() || null;
  const digits = text?.replace(/\D/g, '') || null;
  const { rows } = await db.query<SummaryRow>(
    `select ${summaryColumns}
       from orders o join customers c using (customer_id)
      where o.status = any($1::text[])
        and ($2::text is null or o.site_id = $2)
        and ($3::text is null or o.customer_id = $3)
        and ($4::text is null
             or o.number ilike '%' || $4 || '%'
             or c.name ilike '%' || $4 || '%'
             or ($5::text is not null and c.phone like '%' || $5 || '%'))
      order by case when $6 then o.promised_at end asc, o.created_at desc
      limit $7`,
    [
      stages[stage],
      query.siteId ?? null,
      query.customerId ?? null,
      text,
      digits,
      stage === 'open' || stage === 'ready',
      query.limit,
    ],
  );
  return rows.map(toSummary);
}

type OrderRow = SummaryRow & {
  customer_phone: string;
  pack_id: string | null;
  pack_name: string | null;
  pack_price: number;
  subtotal: number;
  supplement: number;
  express_amount: number;
  storage_amount: number;
  discount: number;
  discount_reason: string;
  note: string;
  location: string;
  cancel_reason: string;
  ready_at: Date | null;
  collected_at: Date | null;
};

export async function findOrder(
  db: SqlExecutor,
  ref: { orderId: string } | { number: string },
): Promise<Order | null> {
  const { rows } = await db.query<OrderRow>(
    `select ${summaryColumns}, c.phone as customer_phone, o.pack_id, o.pack_name, o.pack_price,
            o.subtotal, o.supplement, o.express_amount, o.storage_amount, o.discount, o.discount_reason,
            o.note, o.location, o.cancel_reason, o.ready_at, o.collected_at
       from orders o join customers c using (customer_id)
      where ${'orderId' in ref ? 'o.order_id = $1' : 'upper(o.number) = upper($1)'}`,
    ['orderId' in ref ? ref.orderId : ref.number],
  );
  const row = rows[0];
  if (!row) return null;
  const items = await db.query<{
    item_id: string;
    service_id: string;
    service_name: string;
    article_id: string | null;
    article_name: string | null;
    pricing: 'per_piece' | 'per_kg';
    quantity: string;
    unit_price: number;
    amount: number;
    covered: string;
    due: number;
    defects: string;
  }>(
    `select item_id, service_id, service_name, article_id, article_name, pricing, quantity,
            unit_price, amount, covered, due, defects
       from order_items where order_id = $1 order by position`,
    [row.order_id],
  );
  const payments = await db.query<{
    payment_id: string;
    amount: number;
    method: PaymentMethod;
    kind: PaymentKind;
    reason: string;
    created_by: string;
    created_at: Date;
  }>(
    `select payment_id, amount, method, kind, reason, created_by, created_at
       from payments where order_id = $1 order by created_at`,
    [row.order_id],
  );
  const events = await db.query<{
    kind: string;
    detail: Record<string, string | number | boolean>;
    actor_id: string;
    actor_kind: string;
    at: Date;
  }>(
    `select kind, detail, actor_id, actor_kind, at from order_events
      where order_id = $1 order by at, event_id`,
    [row.order_id],
  );
  return {
    ...toSummary(row),
    customerPhone: row.customer_phone,
    packId: row.pack_id,
    packName: row.pack_name,
    packPrice: row.pack_price,
    subtotal: row.subtotal,
    supplement: row.supplement,
    expressAmount: row.express_amount,
    storageAmount: row.storage_amount,
    discount: row.discount,
    discountReason: row.discount_reason,
    note: row.note,
    location: row.location,
    cancelReason: row.cancel_reason,
    readyAt: row.ready_at,
    collectedAt: row.collected_at,
    items: items.rows.map(
      (item): OrderItem => ({
        itemId: item.item_id,
        serviceId: item.service_id,
        serviceName: item.service_name,
        articleId: item.article_id,
        articleName: item.article_name,
        pricing: item.pricing,
        quantity: Number(item.quantity),
        unitPrice: item.unit_price,
        amount: item.amount,
        covered: Number(item.covered),
        due: item.due,
        defects: item.defects,
      }),
    ),
    payments: payments.rows.map(
      (payment): Payment => ({
        paymentId: payment.payment_id,
        amount: payment.amount,
        method: payment.method,
        kind: payment.kind,
        reason: payment.reason,
        createdBy: payment.created_by,
        createdAt: payment.created_at,
      }),
    ),
    events: events.rows.map(
      (event): OrderEvent => ({
        kind: event.kind,
        detail: event.detail,
        actorId: event.actor_id,
        actorKind: event.actor_kind,
        at: event.at,
      }),
    ),
  };
}

/** The deposit as a gesture needs it: locked, so that two gestures never race on its money. */
export async function lockOrder(
  db: SqlExecutor,
  orderId: string,
): Promise<{
  orderId: string;
  siteId: string;
  number: string;
  status: OrderStatus;
  total: number;
  paid: number;
  pieces: number;
} | null> {
  const { rows } = await db.query<{
    order_id: string;
    site_id: string;
    number: string;
    status: OrderStatus;
    total: number;
    paid: number;
    pieces: number;
  }>(
    `select order_id, site_id, number, status, total, paid, pieces from orders
      where order_id = $1 for update`,
    [orderId],
  );
  const row = rows[0];
  return row
    ? {
        orderId: row.order_id,
        siteId: row.site_id,
        number: row.number,
        status: row.status,
        total: row.total,
        paid: row.paid,
        pieces: row.pieces,
      }
    : null;
}

export interface DaySummary {
  /** Deposits received in the period. */
  received: number;
  pieces: number;
  /** Payments minus refunds of the period. */
  cashed: number;
  /** Ready and waiting for their customer. */
  ready: number;
  /** Ready for longer than the laundry's « dormant » delay. */
  dormant: number;
  /** Promised before now and not ready yet. */
  late: number;
  /** What customers still owe on deposits that are not cancelled. */
  outstanding: number;
}

/** The figures of a period (a day, usually), for a site or for all of them. */
export async function daySummary(
  db: SqlExecutor,
  query: { from: Date; to: Date; siteId?: string | undefined; dormantDays: number },
): Promise<DaySummary> {
  const site = query.siteId ?? null;
  const orders = await db.query<{
    received: string;
    pieces: string;
    ready: string;
    dormant: string;
    late: string;
    outstanding: string;
  }>(
    `select count(*) filter (where created_at >= $1 and created_at < $2 and status <> 'cancelled')
              as received,
            coalesce(sum(pieces) filter (where created_at >= $1 and created_at < $2
                                           and status <> 'cancelled'), 0) as pieces,
            count(*) filter (where status = 'ready') as ready,
            count(*) filter (where status = 'ready'
                               and ready_at < now() - make_interval(days => $4)) as dormant,
            count(*) filter (where status in ('received', 'in_progress') and promised_at < now())
              as late,
            coalesce(sum(total - paid) filter (where status <> 'cancelled'), 0) as outstanding
       from orders
      where ($3::text is null or site_id = $3)`,
    [query.from, query.to, site, query.dormantDays],
  );
  const money = await db.query<{ cashed: string }>(
    `select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) as cashed
       from payments
      where created_at >= $1 and created_at < $2 and ($3::text is null or site_id = $3)`,
    [query.from, query.to, site],
  );
  const row = orders.rows[0];
  return {
    received: Number(row?.received ?? 0),
    pieces: Number(row?.pieces ?? 0),
    cashed: Number(money.rows[0]?.cashed ?? 0),
    ready: Number(row?.ready ?? 0),
    dormant: Number(row?.dormant ?? 0),
    late: Number(row?.late ?? 0),
    outstanding: Number(row?.outstanding ?? 0),
  };
}
