import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import { placeOf, type AllocationKey, type Place } from '../domain/network';

// The tables of a laundry with several sites (specs/028-sites), each with its row-level security.

export function networkMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
create table ${s}.transfer_counters (
  organization_id text primary key,
  next_seq integer not null
);
${secure('transfer_counters', 'select, insert, update')}

-- Deposits that leave a site for another, with their slip: sent once, received once.
create table ${s}.transfers (
  transfer_id text primary key,
  organization_id text not null,
  number text not null,
  from_site_id text not null references ${s}.sites (site_id),
  to_site_id text not null references ${s}.sites (site_id),
  status text not null default 'sent' check (status in ('sent', 'received')),
  note text not null default '',
  sent_by text not null,
  sent_at timestamptz not null default clock_timestamp(),
  received_by text,
  received_at timestamptz,
  reception_note text not null default '',
  check (from_site_id <> to_site_id),
  unique (organization_id, number)
);
create index transfers_open on ${s}.transfers (organization_id, sent_at) where status = 'sent';
${secure('transfers', 'select, insert, update')}

create table ${s}.transfer_orders (
  organization_id text not null,
  transfer_id text not null references ${s}.transfers (transfer_id),
  order_id text not null references ${s}.orders (order_id),
  -- Whether it was found when the slip was received.
  received boolean not null default false,
  primary key (transfer_id, order_id)
);
create index transfer_orders_by_order on ${s}.transfer_orders (order_id);
${secure('transfer_orders', 'select, insert, update')}

-- A counter run by a partner — a shop, a hotel desk — and what the laundry gives it.
create table ${s}.partner_points (
  organization_id text not null,
  site_id text not null references ${s}.sites (site_id),
  partner_name text not null check (length(partner_name) between 1 and 120),
  phone text not null default '',
  commission_percent numeric(5, 2) not null default 0 check (commission_percent between 0 and 100),
  primary key (organization_id, site_id)
);
${secure('partner_points', 'select, insert, update, delete')}

-- How the charges that name no site are spread over the sites.
create table ${s}.network_rules (
  organization_id text primary key,
  allocation text not null default 'sales' check (allocation in ('sales', 'pieces', 'equal'))
);
${secure('network_rules', 'select, insert, update')}
`;
}

// ── Where the deposits are ───────────────────────────────────────────────────────────────────

export interface PlacedOrder {
  orderId: string;
  number: string;
  customerName: string;
  status: string;
  homeSiteId: string;
  plantSiteId: string | null;
  pieces: number;
  kilos: number;
  place: Place;
}

type PlacedRow = {
  order_id: string;
  number: string;
  customer_name: string;
  status: string;
  site_id: string;
  plant_site_id: string | null;
  pieces: number;
  kilos: string;
  transfer_id: string | null;
  to_site_id: string | null;
  transfer_status: 'sent' | 'received' | null;
  received: boolean | null;
};

const PLACED_SELECT = `
  select o.order_id, o.number, c.name as customer_name, o.status, o.site_id, s.plant_site_id, o.pieces, o.kilos,
         l.transfer_id, l.to_site_id, l.status as transfer_status, l.received
    from orders o join customers c on c.customer_id = o.customer_id
    join sites s on s.site_id = o.site_id
    left join lateral (
      select t.transfer_id, t.to_site_id, t.status, x.received
        from transfer_orders x join transfers t on t.transfer_id = x.transfer_id
       where x.order_id = o.order_id order by t.sent_at desc limit 1
    ) l on true`;

const toPlaced = (row: PlacedRow): PlacedOrder => ({
  orderId: row.order_id,
  number: row.number,
  customerName: row.customer_name,
  status: row.status,
  homeSiteId: row.site_id,
  plantSiteId: row.plant_site_id,
  pieces: row.pieces,
  kilos: Number(row.kilos),
  place: placeOf(
    row.site_id,
    row.transfer_id && row.to_site_id && row.transfer_status
      ? { transferId: row.transfer_id, toSiteId: row.to_site_id, status: row.transfer_status, received: row.received ?? false }
      : null,
  ),
});

/** The deposits still at the laundry, each with where it is. */
export async function openOrdersPlaced(db: SqlExecutor): Promise<PlacedOrder[]> {
  const { rows } = await db.query<PlacedRow>(
    `${PLACED_SELECT} where o.status in ('received', 'in_progress', 'ready') order by o.promised_at limit 1000`,
  );
  return rows.map(toPlaced);
}

/** These deposits, locked, each with where it is: what a transfer checks before it leaves. */
export async function lockPlaced(db: SqlExecutor, orderIds: string[]): Promise<PlacedOrder[]> {
  await db.query(`select order_id from orders where order_id = any($1::text[]) for update`, [orderIds]);
  const { rows } = await db.query<PlacedRow>(`${PLACED_SELECT} where o.order_id = any($1::text[])`, [orderIds]);
  return rows.map(toPlaced);
}

// ── Transfers ────────────────────────────────────────────────────────────────────────────────

export interface TransferLine {
  orderId: string;
  number: string;
  customerName: string;
  pieces: number;
  kilos: number;
  received: boolean;
}

export interface Transfer {
  transferId: string;
  number: string;
  fromSiteId: string;
  fromName: string;
  toSiteId: string;
  toName: string;
  status: 'sent' | 'received';
  note: string;
  receptionNote: string;
  sentAt: Date;
  receivedAt: Date | null;
  lines: TransferLine[];
}

async function takeTransferNumber(db: SqlExecutor, organizationId: string): Promise<number> {
  const { rows } = await db.query<{ seq: number }>(
    `insert into transfer_counters (organization_id, next_seq) values ($1, 2)
     on conflict (organization_id) do update set next_seq = transfer_counters.next_seq + 1
     returning next_seq - 1 as seq`,
    [organizationId],
  );
  return rows[0]?.seq ?? 1;
}

export async function insertTransfer(
  db: SqlExecutor,
  organizationId: string,
  transfer: { numberOf: (seq: number) => string; fromSiteId: string; toSiteId: string; note: string; sentBy: string; orderIds: string[] },
): Promise<{ transferId: string; number: string }> {
  const transferId = newId('trf');
  const number = transfer.numberOf(await takeTransferNumber(db, organizationId));
  await db.query(
    `insert into transfers (transfer_id, organization_id, number, from_site_id, to_site_id, note, sent_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [transferId, organizationId, number, transfer.fromSiteId, transfer.toSiteId, transfer.note, transfer.sentBy],
  );
  await db.query(
    `insert into transfer_orders (organization_id, transfer_id, order_id)
     select $1, $2, unnest($3::text[])`,
    [organizationId, transferId, transfer.orderIds],
  );
  return { transferId, number };
}

type TransferRow = {
  transfer_id: string;
  number: string;
  from_site_id: string;
  from_name: string;
  to_site_id: string;
  to_name: string;
  status: 'sent' | 'received';
  note: string;
  reception_note: string;
  sent_at: Date;
  received_at: Date | null;
};

const TRANSFER_SELECT = `
  select t.transfer_id, t.number, t.from_site_id, f.name as from_name, t.to_site_id, d.name as to_name, t.status,
         t.note, t.reception_note, t.sent_at, t.received_at
    from transfers t join sites f on f.site_id = t.from_site_id join sites d on d.site_id = t.to_site_id`;

async function withLines(db: SqlExecutor, rows: TransferRow[]): Promise<Transfer[]> {
  if (rows.length === 0) return [];
  const lines = await db.query<{
    transfer_id: string;
    order_id: string;
    number: string;
    customer_name: string;
    pieces: number;
    kilos: string;
    received: boolean;
  }>(
    `select x.transfer_id, x.order_id, o.number, c.name as customer_name, o.pieces, o.kilos, x.received
       from transfer_orders x join orders o on o.order_id = x.order_id
       join customers c on c.customer_id = o.customer_id
      where x.transfer_id = any($1::text[]) order by o.number`,
    [rows.map((row) => row.transfer_id)],
  );
  return rows.map((row) => ({
    transferId: row.transfer_id,
    number: row.number,
    fromSiteId: row.from_site_id,
    fromName: row.from_name,
    toSiteId: row.to_site_id,
    toName: row.to_name,
    status: row.status,
    note: row.note,
    receptionNote: row.reception_note,
    sentAt: row.sent_at,
    receivedAt: row.received_at,
    lines: lines.rows
      .filter((line) => line.transfer_id === row.transfer_id)
      .map((line) => ({
        orderId: line.order_id,
        number: line.number,
        customerName: line.customer_name,
        pieces: line.pieces,
        kilos: Number(line.kilos),
        received: line.received,
      })),
  }));
}

/** The slips on the road, then the latest received. */
export async function listTransfers(db: SqlExecutor): Promise<Transfer[]> {
  const { rows } = await db.query<TransferRow>(
    `${TRANSFER_SELECT} order by (t.status = 'sent') desc, t.sent_at desc limit 40`,
  );
  return withLines(db, rows);
}

export async function findTransfer(db: SqlExecutor, transferId: string, lock = false): Promise<Transfer | null> {
  const { rows } = await db.query<TransferRow>(
    `${TRANSFER_SELECT} where t.transfer_id = $1 ${lock ? 'for update of t' : ''}`,
    [transferId],
  );
  return (await withLines(db, rows))[0] ?? null;
}

export async function markReceived(
  db: SqlExecutor,
  transferId: string,
  reception: { orderIds: string[]; receivedBy: string; note: string },
): Promise<void> {
  await db.query(
    `update transfers set status = 'received', received_by = $2, received_at = clock_timestamp(), reception_note = $3
      where transfer_id = $1`,
    [transferId, reception.receivedBy, reception.note],
  );
  await db.query(`update transfer_orders set received = true where transfer_id = $1 and order_id = any($2::text[])`, [
    transferId,
    reception.orderIds,
  ]);
}

// ── Partners and the rule ────────────────────────────────────────────────────────────────────

export interface PartnerPoint {
  siteId: string;
  partnerName: string;
  phone: string;
  commissionPercent: number;
}

export async function listPartners(db: SqlExecutor): Promise<PartnerPoint[]> {
  const { rows } = await db.query<{ site_id: string; partner_name: string; phone: string; commission_percent: string }>(
    `select site_id, partner_name, phone, commission_percent from partner_points`,
  );
  return rows.map((row) => ({
    siteId: row.site_id,
    partnerName: row.partner_name,
    phone: row.phone,
    commissionPercent: Number(row.commission_percent),
  }));
}

export async function savePartner(db: SqlExecutor, organizationId: string, partner: PartnerPoint): Promise<void> {
  await db.query(
    `insert into partner_points (organization_id, site_id, partner_name, phone, commission_percent)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id, site_id) do update set partner_name = $3, phone = $4, commission_percent = $5`,
    [organizationId, partner.siteId, partner.partnerName, partner.phone, partner.commissionPercent],
  );
}

export async function removePartner(db: SqlExecutor, siteId: string): Promise<boolean> {
  const { rows } = await db.query<{ site_id: string }>(`delete from partner_points where site_id = $1 returning site_id`, [
    siteId,
  ]);
  return rows.length > 0;
}

export async function readAllocation(db: SqlExecutor): Promise<AllocationKey> {
  const { rows } = await db.query<{ allocation: AllocationKey }>(`select allocation from network_rules`);
  return rows[0]?.allocation ?? 'sales';
}

export async function saveAllocation(db: SqlExecutor, organizationId: string, allocation: AllocationKey): Promise<void> {
  await db.query(
    `insert into network_rules (organization_id, allocation) values ($1, $2)
     on conflict (organization_id) do update set allocation = $2`,
    [organizationId, allocation],
  );
}

// ── A month, site by site ────────────────────────────────────────────────────────────────────

/** What each site received in a period: deposits, pieces, their price — cancelled ones apart. */
export async function salesBySite(
  db: SqlExecutor,
  period: { from: string; to: string },
): Promise<Map<string, { orders: number; pieces: number; sales: number }>> {
  const { rows } = await db.query<{ site_id: string; orders: string; pieces: string; sales: string }>(
    `select site_id, count(*) as orders, coalesce(sum(pieces), 0) as pieces, coalesce(sum(total), 0) as sales
       from orders where created_at >= $1::date and created_at < $2::date and status <> 'cancelled'
      group by site_id`,
    [period.from, period.to],
  );
  return new Map(
    rows.map((row) => [row.site_id, { orders: Number(row.orders), pieces: Number(row.pieces), sales: Number(row.sales) }]),
  );
}

/** Payments minus refunds taken at each site in a period, whatever the way. */
export async function cashedBySite(db: SqlExecutor, period: { from: string; to: string }): Promise<Map<string, number>> {
  const { rows } = await db.query<{ site_id: string; cashed: string }>(
    `select site_id, coalesce(sum(case when kind = 'refund' then -amount else amount end), 0) as cashed
       from payments where created_at >= $1::date and created_at < $2::date group by site_id`,
    [period.from, period.to],
  );
  return new Map(rows.map((row) => [row.site_id, Number(row.cashed)]));
}

/**
 * Credit paid ahead in a period that no deposit took yet in it: money that came in and belongs
 * to no site. With it the sites' figures add up to the laundry's.
 */
export async function prepaidNotSpent(db: SqlExecutor, period: { from: string; to: string }): Promise<number> {
  const { rows } = await db.query<{ topped: string; spent: string }>(
    `select coalesce((select sum(cashed) from credit_entries
                       where kind = 'top_up' and created_at >= $1::date and created_at < $2::date), 0) as topped,
            coalesce((select sum(case when kind = 'refund' then -amount else amount end) from payments
                       where method = 'credit' and created_at >= $1::date and created_at < $2::date), 0) as spent`,
    [period.from, period.to],
  );
  return Number(rows[0]?.topped ?? 0) - Number(rows[0]?.spent ?? 0);
}
