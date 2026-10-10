import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { MoveKind, PurchaseStatus } from '../domain/stock';

// The tables of stock and purchasing (specs/029-stock), each with its row-level security.

export function stockMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
-- What the laundry keeps on its shelves: detergent, hangers, covers — in its own unit.
create table ${s}.stock_items (
  item_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 80),
  unit text not null check (length(unit) between 1 and 16),
  -- At or under it, the laundry wants to be told; 0: never.
  threshold numeric(12, 3) not null default 0 check (threshold >= 0),
  active boolean not null default true
);
create unique index stock_items_by_name on ${s}.stock_items (organization_id, lower(name));
${secure('stock_items', 'select, insert, update')}

create table ${s}.suppliers (
  supplier_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 120),
  phone text not null default '',
  note text not null default '',
  active boolean not null default true
);
create unique index suppliers_by_name on ${s}.suppliers (organization_id, lower(name));
${secure('suppliers', 'select, insert, update')}

create table ${s}.purchase_counters (
  organization_id text primary key,
  next_seq integer not null
);
${secure('purchase_counters', 'select, insert, update')}

create table ${s}.purchase_orders (
  purchase_id text primary key,
  organization_id text not null,
  number text not null,
  supplier_id text not null references ${s}.suppliers (supplier_id),
  status text not null default 'ordered' check (status in ('ordered', 'received', 'cancelled')),
  ordered_on date not null default current_date,
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  received_at timestamptz,
  received_by text,
  unique (organization_id, number)
);
create index purchase_orders_open on ${s}.purchase_orders (organization_id, created_at) where status = 'ordered';
${secure('purchase_orders', 'select, insert, update')}

create table ${s}.purchase_lines (
  line_id text primary key,
  organization_id text not null,
  purchase_id text not null references ${s}.purchase_orders (purchase_id),
  item_id text not null references ${s}.stock_items (item_id),
  quantity numeric(12, 3) not null check (quantity > 0),
  unit_cost integer not null check (unit_cost >= 0),
  -- What really arrived, at what it really cost: written by the reception.
  received numeric(12, 3) not null default 0 check (received >= 0),
  received_cost integer not null default 0 check (received_cost >= 0)
);
create index purchase_lines_by_purchase on ${s}.purchase_lines (purchase_id);
${secure('purchase_lines', 'select, insert, update')}

-- Every movement of a shelf: in, out, and the gap an inventory found. Never changed nor deleted.
create table ${s}.stock_moves (
  move_id text primary key,
  organization_id text not null,
  item_id text not null references ${s}.stock_items (item_id),
  kind text not null check (kind in ('reception', 'use', 'count', 'loss')),
  -- Signed: what the shelf gains or loses.
  quantity numeric(12, 3) not null,
  unit_cost integer check (unit_cost >= 0),
  purchase_id text references ${s}.purchase_orders (purchase_id),
  note text not null default '',
  created_by text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index stock_moves_by_item on ${s}.stock_moves (organization_id, item_id, created_at);
${secure('stock_moves', 'select, insert')}

-- What the laundry paid a supplier: each one is also an expense, so that the money stays true.
create table ${s}.supplier_payments (
  payment_id text primary key,
  organization_id text not null,
  supplier_id text not null references ${s}.suppliers (supplier_id),
  amount integer not null check (amount > 0),
  expense_id text not null references ${s}.expenses (expense_id),
  paid_on date not null default current_date,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp()
);
create index supplier_payments_by_supplier on ${s}.supplier_payments (organization_id, supplier_id);
${secure('supplier_payments', 'select, insert')}
`;
}

// ── Items and their levels ───────────────────────────────────────────────────────────────────

export interface StockLine {
  itemId: string;
  name: string;
  unit: string;
  threshold: number;
  active: boolean;
  level: number;
  /** What was received with a cost: quantity, and its value. */
  pricedQuantity: number;
  pricedValue: number;
}

export async function listStock(db: SqlExecutor, itemId?: string): Promise<StockLine[]> {
  const { rows } = await db.query<{
    item_id: string;
    name: string;
    unit: string;
    threshold: string;
    active: boolean;
    level: string;
    priced_quantity: string;
    priced_value: string;
  }>(
    `select i.item_id, i.name, i.unit, i.threshold, i.active,
            coalesce(sum(m.quantity), 0) as level,
            coalesce(sum(m.quantity) filter (where m.kind = 'reception' and m.unit_cost is not null), 0) as priced_quantity,
            coalesce(sum(m.quantity * m.unit_cost) filter (where m.kind = 'reception' and m.unit_cost is not null), 0)
              as priced_value
       from stock_items i left join stock_moves m on m.item_id = i.item_id
      where ($1::text is null or i.item_id = $1)
      group by i.item_id order by i.active desc, lower(i.name)`,
    [itemId ?? null],
  );
  return rows.map((row) => ({
    itemId: row.item_id,
    name: row.name,
    unit: row.unit,
    threshold: Number(row.threshold),
    active: row.active,
    level: Number(row.level),
    pricedQuantity: Number(row.priced_quantity),
    pricedValue: Number(row.priced_value),
  }));
}

/** Locks an item's row: its level is read, then moved, by one gesture at a time. */
export async function lockItem(db: SqlExecutor, itemId: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from stock_items where item_id = $1 for update`, [itemId]);
  return rows.length > 0;
}

/** Creates an item or changes it; null when its name is another item's. */
export async function saveItem(
  db: SqlExecutor,
  organizationId: string,
  item: { itemId?: string | undefined; name: string; unit: string; threshold: number; active: boolean },
): Promise<string | null> {
  const taken = await db.query(
    `select 1 from stock_items where lower(name) = lower($1) and item_id <> coalesce($2, '')`,
    [item.name, item.itemId ?? null],
  );
  if (taken.rows.length > 0) return null;
  if (item.itemId) {
    const { rows } = await db.query<{ item_id: string }>(
      `update stock_items set name = $2, unit = $3, threshold = $4, active = $5 where item_id = $1 returning item_id`,
      [item.itemId, item.name, item.unit, item.threshold, item.active],
    );
    return rows[0]?.item_id ?? '';
  }
  const itemId = newId('stk');
  await db.query(
    `insert into stock_items (item_id, organization_id, name, unit, threshold, active) values ($1, $2, $3, $4, $5, $6)`,
    [itemId, organizationId, item.name, item.unit, item.threshold, item.active],
  );
  return itemId;
}

export async function insertMove(
  db: SqlExecutor,
  organizationId: string,
  move: {
    itemId: string;
    kind: MoveKind;
    quantity: number;
    unitCost?: number | null;
    purchaseId?: string | null;
    note?: string;
    createdBy: string;
  },
): Promise<void> {
  await db.query(
    `insert into stock_moves (move_id, organization_id, item_id, kind, quantity, unit_cost, purchase_id, note, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      newId('mov'),
      organizationId,
      move.itemId,
      move.kind,
      move.quantity,
      move.unitCost ?? null,
      move.purchaseId ?? null,
      move.note ?? '',
      move.createdBy,
    ],
  );
}

export interface StockMove {
  itemName: string;
  unit: string;
  kind: MoveKind;
  quantity: number;
  note: string;
  createdAt: Date;
}

export async function latestMoves(db: SqlExecutor, limit = 30): Promise<StockMove[]> {
  const { rows } = await db.query<{
    name: string;
    unit: string;
    kind: MoveKind;
    quantity: string;
    note: string;
    created_at: Date;
  }>(
    `select i.name, i.unit, m.kind, m.quantity, m.note, m.created_at
       from stock_moves m join stock_items i on i.item_id = m.item_id
      order by m.created_at desc limit $1`,
    [limit],
  );
  return rows.map((row) => ({
    itemName: row.name,
    unit: row.unit,
    kind: row.kind,
    quantity: Number(row.quantity),
    note: row.note,
    createdAt: row.created_at,
  }));
}

/** What left the shelves in a period (uses and losses), item by item: a positive quantity. */
export async function usedIn(
  db: SqlExecutor,
  period: { from: string; to: string },
): Promise<{ itemId: string; quantity: number }[]> {
  const { rows } = await db.query<{ item_id: string; quantity: string }>(
    `select item_id, -sum(quantity) as quantity from stock_moves
      where kind in ('use', 'loss') and created_at >= $1::date and created_at < $2::date
      group by item_id`,
    [period.from, period.to],
  );
  return rows.map((row) => ({ itemId: row.item_id, quantity: Number(row.quantity) }));
}

// ── Suppliers ────────────────────────────────────────────────────────────────────────────────

export interface Supplier {
  supplierId: string;
  name: string;
  phone: string;
  note: string;
  active: boolean;
  /** The value of what was received from her, and what she was paid. */
  received: number;
  paid: number;
}

export async function listSuppliers(db: SqlExecutor, supplierId?: string): Promise<Supplier[]> {
  const { rows } = await db.query<{
    supplier_id: string;
    name: string;
    phone: string;
    note: string;
    active: boolean;
    received: string;
    paid: string;
  }>(
    `select s.supplier_id, s.name, s.phone, s.note, s.active,
            coalesce((select sum(round(l.received * l.received_cost)) from purchase_lines l
                       join purchase_orders p on p.purchase_id = l.purchase_id
                      where p.supplier_id = s.supplier_id and p.status = 'received'), 0) as received,
            coalesce((select sum(y.amount) from supplier_payments y where y.supplier_id = s.supplier_id), 0) as paid
       from suppliers s where ($1::text is null or s.supplier_id = $1)
      order by s.active desc, lower(s.name)`,
    [supplierId ?? null],
  );
  return rows.map((row) => ({
    supplierId: row.supplier_id,
    name: row.name,
    phone: row.phone,
    note: row.note,
    active: row.active,
    received: Number(row.received),
    paid: Number(row.paid),
  }));
}

export async function lockSupplier(db: SqlExecutor, supplierId: string): Promise<boolean> {
  const { rows } = await db.query(`select 1 from suppliers where supplier_id = $1 for update`, [supplierId]);
  return rows.length > 0;
}

export async function saveSupplier(
  db: SqlExecutor,
  organizationId: string,
  supplier: { supplierId?: string | undefined; name: string; phone: string; note: string; active: boolean },
): Promise<string | null> {
  const taken = await db.query(
    `select 1 from suppliers where lower(name) = lower($1) and supplier_id <> coalesce($2, '')`,
    [supplier.name, supplier.supplierId ?? null],
  );
  if (taken.rows.length > 0) return null;
  if (supplier.supplierId) {
    const { rows } = await db.query<{ supplier_id: string }>(
      `update suppliers set name = $2, phone = $3, note = $4, active = $5 where supplier_id = $1 returning supplier_id`,
      [supplier.supplierId, supplier.name, supplier.phone, supplier.note, supplier.active],
    );
    return rows[0]?.supplier_id ?? '';
  }
  const supplierId = newId('sup');
  await db.query(
    `insert into suppliers (supplier_id, organization_id, name, phone, note, active) values ($1, $2, $3, $4, $5, $6)`,
    [supplierId, organizationId, supplier.name, supplier.phone, supplier.note, supplier.active],
  );
  return supplierId;
}

export async function insertSupplierPayment(
  db: SqlExecutor,
  organizationId: string,
  payment: { supplierId: string; amount: number; expenseId: string; paidOn: string; createdBy: string },
): Promise<void> {
  await db.query(
    `insert into supplier_payments (payment_id, organization_id, supplier_id, amount, expense_id, paid_on, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [newId('spy'), organizationId, payment.supplierId, payment.amount, payment.expenseId, payment.paidOn, payment.createdBy],
  );
}

// ── Purchase orders ──────────────────────────────────────────────────────────────────────────

export interface PurchaseLine {
  lineId: string;
  itemId: string;
  itemName: string;
  unit: string;
  quantity: number;
  unitCost: number;
  received: number;
  receivedCost: number;
}

export interface Purchase {
  purchaseId: string;
  number: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseStatus;
  orderedOn: string;
  note: string;
  receivedAt: Date | null;
  lines: PurchaseLine[];
}

async function takePurchaseNumber(db: SqlExecutor, organizationId: string): Promise<number> {
  const { rows } = await db.query<{ seq: number }>(
    `insert into purchase_counters (organization_id, next_seq) values ($1, 2)
     on conflict (organization_id) do update set next_seq = purchase_counters.next_seq + 1
     returning next_seq - 1 as seq`,
    [organizationId],
  );
  return rows[0]?.seq ?? 1;
}

export async function insertPurchase(
  db: SqlExecutor,
  organizationId: string,
  purchase: {
    numberOf: (seq: number) => string;
    supplierId: string;
    note: string;
    createdBy: string;
    lines: { itemId: string; quantity: number; unitCost: number }[];
  },
): Promise<{ purchaseId: string; number: string }> {
  const purchaseId = newId('pur');
  const number = purchase.numberOf(await takePurchaseNumber(db, organizationId));
  await db.query(
    `insert into purchase_orders (purchase_id, organization_id, number, supplier_id, note, created_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [purchaseId, organizationId, number, purchase.supplierId, purchase.note, purchase.createdBy],
  );
  for (const line of purchase.lines) {
    await db.query(
      `insert into purchase_lines (line_id, organization_id, purchase_id, item_id, quantity, unit_cost)
       values ($1, $2, $3, $4, $5, $6)`,
      [newId('pli'), organizationId, purchaseId, line.itemId, line.quantity, line.unitCost],
    );
  }
  return { purchaseId, number };
}

type PurchaseRow = {
  purchase_id: string;
  number: string;
  supplier_id: string;
  supplier_name: string;
  status: PurchaseStatus;
  ordered_on: string;
  note: string;
  received_at: Date | null;
};

const PURCHASE_SELECT = `
  select p.purchase_id, p.number, p.supplier_id, s.name as supplier_name, p.status,
         to_char(p.ordered_on, 'YYYY-MM-DD') as ordered_on, p.note, p.received_at
    from purchase_orders p join suppliers s on s.supplier_id = p.supplier_id`;

async function withLines(db: SqlExecutor, rows: PurchaseRow[]): Promise<Purchase[]> {
  if (rows.length === 0) return [];
  const lines = await db.query<{
    line_id: string;
    purchase_id: string;
    item_id: string;
    name: string;
    unit: string;
    quantity: string;
    unit_cost: number;
    received: string;
    received_cost: number;
  }>(
    `select l.line_id, l.purchase_id, l.item_id, i.name, i.unit, l.quantity, l.unit_cost, l.received, l.received_cost
       from purchase_lines l join stock_items i on i.item_id = l.item_id
      where l.purchase_id = any($1::text[]) order by lower(i.name)`,
    [rows.map((row) => row.purchase_id)],
  );
  return rows.map((row) => ({
    purchaseId: row.purchase_id,
    number: row.number,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    status: row.status,
    orderedOn: row.ordered_on,
    note: row.note,
    receivedAt: row.received_at,
    lines: lines.rows
      .filter((line) => line.purchase_id === row.purchase_id)
      .map((line) => ({
        lineId: line.line_id,
        itemId: line.item_id,
        itemName: line.name,
        unit: line.unit,
        quantity: Number(line.quantity),
        unitCost: line.unit_cost,
        received: Number(line.received),
        receivedCost: line.received_cost,
      })),
  }));
}

/** The orders that wait for their goods, then the latest closed. */
export async function listPurchases(db: SqlExecutor): Promise<Purchase[]> {
  const { rows } = await db.query<PurchaseRow>(
    `${PURCHASE_SELECT} order by (p.status = 'ordered') desc, p.created_at desc limit 40`,
  );
  return withLines(db, rows);
}

export async function findPurchase(db: SqlExecutor, purchaseId: string, lock = false): Promise<Purchase | null> {
  const { rows } = await db.query<PurchaseRow>(
    `${PURCHASE_SELECT} where p.purchase_id = $1 ${lock ? 'for update of p' : ''}`,
    [purchaseId],
  );
  return (await withLines(db, rows))[0] ?? null;
}

export async function closePurchase(
  db: SqlExecutor,
  purchaseId: string,
  outcome:
    | { status: 'received'; receivedBy: string; lines: { lineId: string; quantity: number; unitCost: number }[] }
    | { status: 'cancelled' },
): Promise<void> {
  if (outcome.status === 'received') {
    for (const line of outcome.lines) {
      await db.query(`update purchase_lines set received = $2, received_cost = $3 where line_id = $1`, [
        line.lineId,
        line.quantity,
        line.unitCost,
      ]);
    }
  }
  await db.query(
    `update purchase_orders
        set status = $2, received_at = case when $2 = 'received' then clock_timestamp() end, received_by = $3
      where purchase_id = $1`,
    [purchaseId, outcome.status, outcome.status === 'received' ? outcome.receivedBy : null],
  );
}
