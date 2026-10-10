import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { DeliveryKind, DeliveryStatus } from '../domain/delivery';

// The tables of collecting and delivering (specs/027-delivery), each with its row-level security.

export function deliveryMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
-- Where the laundry goes, and what a trip there costs the customer: its own decision.
create table ${s}.delivery_zones (
  zone_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 80),
  fee integer not null default 0 check (fee >= 0),
  active boolean not null default true,
  unique (organization_id, name)
);
${secure('delivery_zones', 'select, insert, update')}

create table ${s}.deliveries (
  delivery_id text primary key,
  organization_id text not null,
  kind text not null check (kind in ('collect', 'deliver')),
  customer_id text not null references ${s}.customers (customer_id),
  -- The deposit brought back; none for laundry fetched at a customer's.
  order_id text references ${s}.orders (order_id),
  zone_id text not null references ${s}.delivery_zones (zone_id),
  -- The zone and its fee as they were when the trip was planned.
  zone_name text not null,
  fee integer not null default 0 check (fee >= 0),
  address text not null check (length(address) between 1 and 300),
  planned_on date not null,
  status text not null default 'planned' check (status in ('planned', 'out', 'done', 'failed', 'cancelled')),
  courier_id text,
  note text not null default '',
  -- The proof: who received it, and when.
  recipient text not null default '',
  proof_note text not null default '',
  failure text not null default '',
  cashed integer not null default 0 check (cashed >= 0),
  started_at timestamptz,
  closed_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  check (kind = 'collect' or order_id is not null)
);
create index deliveries_by_day on ${s}.deliveries (organization_id, planned_on, status);
-- A deposit has one trip under way at a time.
create unique index deliveries_one_open_per_order on ${s}.deliveries (order_id)
  where order_id is not null and status in ('planned', 'out');
${secure('deliveries', 'select, insert, update')}

-- A delivery's fee is part of the deposit's price, and says its name on an invoice.
alter table ${s}.orders add column delivery_amount integer not null default 0 check (delivery_amount >= 0);
alter table ${s}.invoice_lines drop constraint invoice_lines_kind_check;
alter table ${s}.invoice_lines add constraint invoice_lines_kind_check
  check (kind in ('item', 'pack', 'express', 'discount', 'order', 'storage', 'delivery'));
`;
}

// ── Zones ────────────────────────────────────────────────────────────────────────────────────

export interface Zone {
  zoneId: string;
  name: string;
  fee: number;
  active: boolean;
}

export async function listZones(db: SqlExecutor): Promise<Zone[]> {
  const { rows } = await db.query<{ zone_id: string; name: string; fee: number; active: boolean }>(
    `select zone_id, name, fee, active from delivery_zones order by active desc, name`,
  );
  return rows.map((row) => ({ zoneId: row.zone_id, name: row.name, fee: row.fee, active: row.active }));
}

/** Creates a zone or changes it; null when its name is another zone's. */
export async function saveZone(
  db: SqlExecutor,
  organizationId: string,
  zone: { zoneId?: string | undefined; name: string; fee: number; active: boolean },
): Promise<string | null> {
  const taken = await db.query<{ zone_id: string }>(
    `select zone_id from delivery_zones where lower(name) = lower($1) and zone_id <> coalesce($2, '')`,
    [zone.name, zone.zoneId ?? null],
  );
  if (taken.rows.length > 0) return null;
  if (zone.zoneId) {
    const { rows } = await db.query<{ zone_id: string }>(
      `update delivery_zones set name = $2, fee = $3, active = $4 where zone_id = $1 returning zone_id`,
      [zone.zoneId, zone.name, zone.fee, zone.active],
    );
    return rows[0]?.zone_id ?? '';
  }
  const zoneId = newId('zon');
  await db.query(
    `insert into delivery_zones (zone_id, organization_id, name, fee, active) values ($1, $2, $3, $4, $5)`,
    [zoneId, organizationId, zone.name, zone.fee, zone.active],
  );
  return zoneId;
}

// ── Trips ────────────────────────────────────────────────────────────────────────────────────

export interface Delivery {
  deliveryId: string;
  kind: DeliveryKind;
  customerId: string;
  customerName: string;
  customerPhone: string;
  orderId: string | null;
  orderNumber: string | null;
  /** What is still owed on the deposit: what the courier is to collect. */
  balance: number;
  orderStatus: string | null;
  zoneId: string;
  zoneName: string;
  fee: number;
  address: string;
  plannedOn: string;
  status: DeliveryStatus;
  courierId: string | null;
  note: string;
  recipient: string;
  proofNote: string;
  failure: string;
  cashed: number;
  closedAt: Date | null;
  createdAt: Date;
}

type DeliveryRow = {
  delivery_id: string;
  kind: DeliveryKind;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  order_id: string | null;
  number: string | null;
  balance: number | null;
  order_status: string | null;
  zone_id: string;
  zone_name: string;
  fee: number;
  address: string;
  planned_on: string;
  status: DeliveryStatus;
  courier_id: string | null;
  note: string;
  recipient: string;
  proof_note: string;
  failure: string;
  cashed: number;
  closed_at: Date | null;
  created_at: Date;
};

const DELIVERY_SELECT = `
  select d.delivery_id, d.kind, d.customer_id, c.name as customer_name, c.phone as customer_phone, d.order_id,
         o.number, o.total - o.paid as balance, o.status as order_status, d.zone_id, d.zone_name, d.fee, d.address,
         to_char(d.planned_on, 'YYYY-MM-DD') as planned_on, d.status, d.courier_id, d.note, d.recipient,
         d.proof_note, d.failure, d.cashed, d.closed_at, d.created_at
    from deliveries d join customers c on c.customer_id = d.customer_id
    left join orders o on o.order_id = d.order_id`;

const toDelivery = (row: DeliveryRow): Delivery => ({
  deliveryId: row.delivery_id,
  kind: row.kind,
  customerId: row.customer_id,
  customerName: row.customer_name,
  customerPhone: row.customer_phone,
  orderId: row.order_id,
  orderNumber: row.number,
  balance: row.balance ?? 0,
  orderStatus: row.order_status,
  zoneId: row.zone_id,
  zoneName: row.zone_name,
  fee: row.fee,
  address: row.address,
  plannedOn: row.planned_on,
  status: row.status,
  courierId: row.courier_id,
  note: row.note,
  recipient: row.recipient,
  proofNote: row.proof_note,
  failure: row.failure,
  cashed: row.cashed,
  closedAt: row.closed_at,
  createdAt: row.created_at,
});

/** The deposit a delivery is planned for: locked, with whether an invoice already bills it. */
export async function orderToDeliver(
  db: SqlExecutor,
  orderId: string,
): Promise<{ customerId: string; status: string; number: string; total: number; paid: number; invoiced: boolean } | null> {
  const { rows } = await db.query<{
    customer_id: string;
    status: string;
    number: string;
    total: number;
    paid: number;
    invoiced: boolean;
  }>(
    `select o.customer_id, o.status, o.number, o.total, o.paid,
            exists (select 1 from invoice_orders l where l.order_id = o.order_id) as invoiced
       from orders o where o.order_id = $1 for update of o`,
    [orderId],
  );
  const row = rows[0];
  return row
    ? {
        customerId: row.customer_id,
        status: row.status,
        number: row.number,
        total: row.total,
        paid: row.paid,
        invoiced: row.invoiced,
      }
    : null;
}

/** Adds a delivery's fee to its deposit, or takes it back (a negative amount). */
export async function moveDeliveryFee(db: SqlExecutor, orderId: string, amount: number): Promise<void> {
  await db.query(
    `update orders set total = total + $2, delivery_amount = delivery_amount + $2 where order_id = $1`,
    [orderId, amount],
  );
}

/** Plans a trip; null when the deposit already has one under way. */
export async function insertDelivery(
  db: SqlExecutor,
  organizationId: string,
  trip: {
    kind: DeliveryKind;
    customerId: string;
    orderId: string | null;
    zoneId: string;
    zoneName: string;
    fee: number;
    address: string;
    plannedOn: string;
    courierId: string | null;
    note: string;
    createdBy: string;
  },
): Promise<string | null> {
  const deliveryId = newId('dlv');
  const { rows } = await db.query<{ delivery_id: string }>(
    `insert into deliveries (delivery_id, organization_id, kind, customer_id, order_id, zone_id, zone_name, fee,
                             address, planned_on, courier_id, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     on conflict do nothing returning delivery_id`,
    [
      deliveryId,
      organizationId,
      trip.kind,
      trip.customerId,
      trip.orderId,
      trip.zoneId,
      trip.zoneName,
      trip.fee,
      trip.address,
      trip.plannedOn,
      trip.courierId,
      trip.note,
      trip.createdBy,
    ],
  );
  return rows[0]?.delivery_id ?? null;
}

export async function findDelivery(db: SqlExecutor, deliveryId: string, lock = false): Promise<Delivery | null> {
  const { rows } = await db.query<DeliveryRow>(
    `${DELIVERY_SELECT} where d.delivery_id = $1 ${lock ? 'for update of d' : ''}`,
    [deliveryId],
  );
  return rows[0] ? toDelivery(rows[0]) : null;
}

/** The trips of a day, with those still open from before; a courier's own, or everyone's. */
export async function listDeliveries(
  db: SqlExecutor,
  filter: { day: string; courierId?: string | undefined; orderId?: string | undefined },
): Promise<Delivery[]> {
  const { rows } = await db.query<DeliveryRow>(
    `${DELIVERY_SELECT}
      where ($3::text is not null and d.order_id = $3)
         or ($3::text is null
             and (d.planned_on = $1::date or (d.planned_on < $1::date and d.status in ('planned', 'out')))
             and ($2::text is null or d.courier_id = $2 or (d.courier_id is null and d.status = 'planned')))
      order by d.created_at limit 300`,
    [filter.day, filter.courierId ?? null, filter.orderId ?? null],
  );
  return rows.map(toDelivery);
}

/** The last address the laundry went to for a customer: proposed the next time. */
export async function lastAddressOf(db: SqlExecutor, customerId: string): Promise<{ address: string; zoneId: string } | null> {
  const { rows } = await db.query<{ address: string; zone_id: string }>(
    `select address, zone_id from deliveries where customer_id = $1 order by created_at desc limit 1`,
    [customerId],
  );
  return rows[0] ? { address: rows[0].address, zoneId: rows[0].zone_id } : null;
}

export async function setCourier(db: SqlExecutor, deliveryId: string, courierId: string | null): Promise<void> {
  await db.query(`update deliveries set courier_id = $2 where delivery_id = $1`, [deliveryId, courierId]);
}

export async function markOut(db: SqlExecutor, deliveryId: string, courierId: string): Promise<void> {
  await db.query(
    `update deliveries set status = 'out', courier_id = $2, started_at = clock_timestamp() where delivery_id = $1`,
    [deliveryId, courierId],
  );
}

export async function closeDelivery(
  db: SqlExecutor,
  deliveryId: string,
  outcome:
    | { status: 'done'; courierId: string; recipient: string; proofNote: string; cashed: number }
    | { status: 'failed'; courierId: string; failure: string }
    | { status: 'cancelled' },
): Promise<void> {
  await db.query(
    `update deliveries
        set status = $2, closed_at = clock_timestamp(), courier_id = coalesce($3, courier_id),
            recipient = $4, proof_note = $5, cashed = $6, failure = $7
      where delivery_id = $1`,
    [
      deliveryId,
      outcome.status,
      'courierId' in outcome ? outcome.courierId : null,
      outcome.status === 'done' ? outcome.recipient : '',
      outcome.status === 'done' ? outcome.proofNote : '',
      outcome.status === 'done' ? outcome.cashed : 0,
      outcome.status === 'failed' ? outcome.failure : '',
    ],
  );
}
