import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { InvoicedOrder, InvoiceKind, InvoiceLine } from '../domain/invoice';
import type { Invoice, InvoiceSettings, InvoiceSummary, Seller } from '../invoice.record';

// Invoices and credit notes (specs/019-invoices). An invoice is written once: the application
// role may read and insert it, never update nor delete it. What links a deposit to its invoice is
// kept apart, so that a credit note frees the deposit without touching the invoice.

export function invoicesMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
-- What the laundry prints on its invoices, and its tax: 0 means it charges no VAT.
create table ${s}.invoice_settings (
  organization_id text primary key,
  legal_name text not null default '' check (length(legal_name) <= 160),
  tax_id text not null default '' check (length(tax_id) <= 40),
  trade_register text not null default '' check (length(trade_register) <= 60),
  address text not null default '' check (length(address) <= 300),
  footer text not null default '' check (length(footer) <= 500),
  vat_percent numeric(5, 2) not null default 0 check (vat_percent between 0 and 50),
  payment_days integer not null default 15 check (payment_days between 0 and 120),
  updated_at timestamptz not null default now()
);
${secure('invoice_settings', 'select, insert, update')}

-- The next number of each series, per year: taken in the invoice's own transaction, so that a
-- number is never skipped.
create table ${s}.invoice_counters (
  organization_id text not null,
  kind text not null check (kind in ('invoice', 'credit')),
  year integer not null,
  next_seq integer not null default 1 check (next_seq >= 1),
  primary key (organization_id, kind, year)
);
${secure('invoice_counters', 'select, insert, update')}

create table ${s}.invoices (
  invoice_id text primary key,
  organization_id text not null,
  kind text not null check (kind in ('invoice', 'credit')),
  number text not null,
  customer_id text not null references ${s}.customers (customer_id),
  -- The customer and the laundry as they were that day: a later change never touches an invoice.
  customer_name text not null,
  customer_phone text not null,
  seller jsonb not null,
  issued_on date not null,
  due_on date,
  vat_percent numeric(5, 2) not null default 0,
  -- A credit note carries the invoice's amounts, negative.
  net integer not null,
  vat integer not null,
  total integer not null,
  credits_invoice_id text references ${s}.invoices (invoice_id),
  reason text not null default '',
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (organization_id, number),
  check ((kind = 'credit') = (credits_invoice_id is not null))
);
-- An invoice is cancelled once.
create unique index invoices_one_credit on ${s}.invoices (credits_invoice_id)
  where credits_invoice_id is not null;
create index invoices_by_customer on ${s}.invoices (organization_id, customer_id, created_at desc);
${secure('invoices', 'select, insert')}

create table ${s}.invoice_lines (
  line_id text primary key,
  organization_id text not null,
  invoice_id text not null references ${s}.invoices (invoice_id),
  position integer not null,
  order_id text references ${s}.orders (order_id),
  order_number text not null default '',
  kind text not null check (kind in ('item', 'pack', 'express', 'discount', 'order')),
  quantity numeric(10, 3) not null default 0,
  pricing text check (pricing in ('per_piece', 'per_kg')),
  label text not null default '',
  covered boolean not null default false,
  amount integer not null
);
create index invoice_lines_by_invoice on ${s}.invoice_lines (invoice_id, position);
${secure('invoice_lines', 'select, insert')}

-- The deposits an invoice bills: a deposit is on one invoice at most. A credit note removes the
-- link — the deposit can be invoiced again — and leaves the invoice as it was written.
create table ${s}.invoice_orders (
  organization_id text not null,
  order_id text not null references ${s}.orders (order_id),
  invoice_id text not null references ${s}.invoices (invoice_id),
  primary key (organization_id, order_id)
);
create index invoice_orders_by_invoice on ${s}.invoice_orders (invoice_id);
${secure('invoice_orders', 'select, insert, delete')}
`;
}

type SettingsRow = {
  legal_name: string;
  tax_id: string;
  trade_register: string;
  address: string;
  footer: string;
  vat_percent: string;
  payment_days: number;
};

/** What the laundry prints on its invoices; before it said anything: nothing, and no VAT. */
export async function readInvoiceSettings(db: SqlExecutor): Promise<InvoiceSettings> {
  const { rows } = await db.query<SettingsRow>(
    `select legal_name, tax_id, trade_register, address, footer, vat_percent, payment_days
       from invoice_settings`,
  );
  const row = rows[0];
  return {
    legalName: row?.legal_name ?? '',
    taxId: row?.tax_id ?? '',
    tradeRegister: row?.trade_register ?? '',
    address: row?.address ?? '',
    footer: row?.footer ?? '',
    vatPercent: Number(row?.vat_percent ?? 0),
    paymentDays: row?.payment_days ?? 15,
  };
}

export async function saveInvoiceSettings(
  db: SqlExecutor,
  organizationId: string,
  settings: InvoiceSettings,
): Promise<void> {
  await db.query(
    `insert into invoice_settings (organization_id, legal_name, tax_id, trade_register, address,
                                   footer, vat_percent, payment_days)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     on conflict (organization_id) do update
       set legal_name = $2, tax_id = $3, trade_register = $4, address = $5, footer = $6,
           vat_percent = $7, payment_days = $8, updated_at = now()`,
    [
      organizationId,
      settings.legalName,
      settings.taxId,
      settings.tradeRegister,
      settings.address,
      settings.footer,
      settings.vatPercent,
      settings.paymentDays,
    ],
  );
}

/** Takes the next number of a series for a year; the row is locked until the invoice is written. */
export async function takeNumber(
  db: SqlExecutor,
  organizationId: string,
  kind: InvoiceKind,
  year: number,
): Promise<number> {
  const { rows } = await db.query<{ seq: number }>(
    `insert into invoice_counters (organization_id, kind, year, next_seq) values ($1, $2, $3, 2)
     on conflict (organization_id, kind, year) do update set next_seq = invoice_counters.next_seq + 1
     returning next_seq - 1 as seq`,
    [organizationId, kind, year],
  );
  return rows[0]?.seq ?? 1;
}

/** A deposit that may go on an invoice, with whether it already is on one. */
export interface BillableOrder extends InvoicedOrder {
  customerId: string;
  status: string;
  paid: number;
  createdAt: Date;
  invoiceId: string | null;
}

type OrderRow = {
  order_id: string;
  number: string;
  customer_id: string;
  status: string;
  total: number;
  paid: number;
  pack_name: string | null;
  pack_price: number;
  express_amount: number;
  discount: number;
  created_at: Date;
  invoice_id: string | null;
};

const ORDER_COLUMNS = `o.order_id, o.number, o.customer_id, o.status, o.total, o.paid, o.pack_name,
  o.pack_price, o.express_amount, o.discount, o.created_at, l.invoice_id`;

async function withItems(db: SqlExecutor, rows: OrderRow[]): Promise<BillableOrder[]> {
  if (rows.length === 0) return [];
  const { rows: items } = await db.query<{
    order_id: string;
    service_name: string;
    article_name: string | null;
    pricing: 'per_piece' | 'per_kg';
    quantity: string;
    amount: number;
    due: number;
  }>(
    `select order_id, service_name, article_name, pricing, quantity, amount, due
       from order_items where order_id = any($1::text[]) order by order_id, position`,
    [rows.map((row) => row.order_id)],
  );
  return rows.map((row) => ({
    orderId: row.order_id,
    number: row.number,
    customerId: row.customer_id,
    status: row.status,
    total: row.total,
    paid: row.paid,
    packName: row.pack_name,
    packPrice: row.pack_price,
    expressAmount: row.express_amount,
    discount: row.discount,
    createdAt: row.created_at,
    invoiceId: row.invoice_id,
    items: items
      .filter((item) => item.order_id === row.order_id)
      .map((item) => ({
        serviceName: item.service_name,
        articleName: item.article_name,
        pricing: item.pricing,
        quantity: Number(item.quantity),
        amount: item.amount,
        due: item.due,
      })),
  }));
}

/** The deposits named, locked until the invoice is written, in the order they were received. */
export async function ordersToBill(db: SqlExecutor, orderIds: string[]): Promise<BillableOrder[]> {
  const { rows } = await db.query<OrderRow>(
    `select ${ORDER_COLUMNS}
       from orders o left join invoice_orders l on l.order_id = o.order_id
      where o.order_id = any($1::text[])
      order by o.created_at, o.order_id
      for update of o`,
    [orderIds],
  );
  return withItems(db, rows);
}

/** The deposits of a customer that are on no invoice: cancelled ones apart. */
export async function uninvoicedOrders(db: SqlExecutor, customerId: string): Promise<BillableOrder[]> {
  const { rows } = await db.query<OrderRow>(
    `select ${ORDER_COLUMNS}
       from orders o left join invoice_orders l on l.order_id = o.order_id
      where o.customer_id = $1 and o.status <> 'cancelled' and l.invoice_id is null
      order by o.created_at, o.order_id`,
    [customerId],
  );
  return withItems(db, rows);
}

/** The deposits an invoice bills, with what each still owes. */
export async function ordersOfInvoice(db: SqlExecutor, invoiceId: string): Promise<BillableOrder[]> {
  const { rows } = await db.query<OrderRow>(
    `select ${ORDER_COLUMNS}
       from invoice_orders l join orders o on o.order_id = l.order_id
      where l.invoice_id = $1
      order by o.created_at, o.order_id
      for update of o`,
    [invoiceId],
  );
  return withItems(db, rows);
}

export async function insertInvoice(
  db: SqlExecutor,
  organizationId: string,
  invoice: {
    kind: InvoiceKind;
    number: string;
    customerId: string;
    customerName: string;
    customerPhone: string;
    seller: Seller;
    issuedOn: string;
    dueOn: string | null;
    vatPercent: number;
    net: number;
    vat: number;
    total: number;
    creditsInvoiceId: string | null;
    reason: string;
    createdBy: string;
  },
  lines: InvoiceLine[],
): Promise<string> {
  const invoiceId = newId('inv');
  await db.query(
    `insert into invoices (invoice_id, organization_id, kind, number, customer_id, customer_name,
                           customer_phone, seller, issued_on, due_on, vat_percent, net, vat, total,
                           credits_invoice_id, reason, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
    [
      invoiceId,
      organizationId,
      invoice.kind,
      invoice.number,
      invoice.customerId,
      invoice.customerName,
      invoice.customerPhone,
      JSON.stringify(invoice.seller),
      invoice.issuedOn,
      invoice.dueOn,
      invoice.vatPercent,
      invoice.net,
      invoice.vat,
      invoice.total,
      invoice.creditsInvoiceId,
      invoice.reason,
      invoice.createdBy,
    ],
  );
  if (lines.length > 0) {
    await db.query(
      `insert into invoice_lines (line_id, organization_id, invoice_id, position, order_id,
                                  order_number, kind, quantity, pricing, label, covered, amount)
       select * from unnest($1::text[], $2::text[], $3::text[], $4::int[], $5::text[], $6::text[],
                            $7::text[], $8::numeric[], $9::text[], $10::text[], $11::boolean[],
                            $12::int[])`,
      [
        lines.map(() => newId('inl')),
        lines.map(() => organizationId),
        lines.map(() => invoiceId),
        lines.map((_, index) => index),
        lines.map((line) => line.orderId),
        lines.map((line) => line.orderNumber),
        lines.map((line) => line.kind),
        lines.map((line) => line.quantity),
        lines.map((line) => line.pricing),
        lines.map((line) => line.label),
        lines.map((line) => line.covered),
        lines.map((line) => line.amount),
      ],
    );
  }
  return invoiceId;
}

export async function linkOrders(
  db: SqlExecutor,
  organizationId: string,
  invoiceId: string,
  orderIds: string[],
): Promise<void> {
  await db.query(
    `insert into invoice_orders (organization_id, order_id, invoice_id)
     select $1, unnest($2::text[]), $3`,
    [organizationId, orderIds, invoiceId],
  );
}

/** Frees the deposits of an invoice that a credit note cancelled. */
export async function unlinkOrders(db: SqlExecutor, invoiceId: string): Promise<void> {
  await db.query(`delete from invoice_orders where invoice_id = $1`, [invoiceId]);
}

type InvoiceRow = {
  invoice_id: string;
  kind: InvoiceKind;
  number: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  seller: Seller;
  issued_on: string;
  due_on: string | null;
  vat_percent: string;
  net: number;
  vat: number;
  total: number;
  credits_invoice_id: string | null;
  reason: string;
  credited_by: string | null;
  credited_by_number: string | null;
  paid: string;
};

// What an invoice was paid: what its deposits were paid, while it still bills them.
const INVOICE_SELECT = `
  select i.invoice_id, i.kind, i.number, i.customer_id, i.customer_name, i.customer_phone, i.seller,
         to_char(i.issued_on, 'YYYY-MM-DD') as issued_on, to_char(i.due_on, 'YYYY-MM-DD') as due_on,
         i.vat_percent, i.net, i.vat, i.total, i.credits_invoice_id, i.reason,
         c.invoice_id as credited_by, c.number as credited_by_number,
         coalesce((select sum(o.paid) from invoice_orders l join orders o on o.order_id = l.order_id
                    where l.invoice_id = i.invoice_id), 0) as paid
    from invoices i left join invoices c on c.credits_invoice_id = i.invoice_id`;

const toSummary = (row: InvoiceRow): InvoiceSummary => ({
  invoiceId: row.invoice_id,
  kind: row.kind,
  number: row.number,
  customerId: row.customer_id,
  customerName: row.customer_name,
  issuedOn: row.issued_on,
  dueOn: row.due_on,
  total: row.total,
  paid: Number(row.paid),
  credited: row.credited_by !== null,
});

export async function listInvoices(
  db: SqlExecutor,
  filter: { customerId?: string | undefined; limit: number },
): Promise<InvoiceSummary[]> {
  const { rows } = await db.query<InvoiceRow>(
    `${INVOICE_SELECT}
      where ($1::text is null or i.customer_id = $1)
      order by i.created_at desc, i.invoice_id desc limit $2`,
    [filter.customerId ?? null, filter.limit],
  );
  return rows.map(toSummary);
}

export async function findInvoice(db: SqlExecutor, invoiceId: string): Promise<Invoice | null> {
  const { rows } = await db.query<InvoiceRow>(`${INVOICE_SELECT} where i.invoice_id = $1`, [invoiceId]);
  const row = rows[0];
  if (!row) return null;
  const { rows: lines } = await db.query<{
    order_id: string | null;
    order_number: string;
    kind: InvoiceLine['kind'];
    quantity: string;
    pricing: InvoiceLine['pricing'];
    label: string;
    covered: boolean;
    amount: number;
  }>(
    `select order_id, order_number, kind, quantity, pricing, label, covered, amount
       from invoice_lines where invoice_id = $1 order by position`,
    [invoiceId],
  );
  const credits = row.credits_invoice_id
    ? await db.query<{ number: string }>(`select number from invoices where invoice_id = $1`, [
        row.credits_invoice_id,
      ])
    : null;
  return {
    ...toSummary(row),
    customerPhone: row.customer_phone,
    seller: row.seller,
    vatPercent: Number(row.vat_percent),
    net: row.net,
    vat: row.vat,
    reason: row.reason,
    creditsInvoiceId: row.credits_invoice_id,
    creditsNumber: credits?.rows[0]?.number ?? null,
    creditedBy: row.credited_by,
    creditedByNumber: row.credited_by_number,
    lines: lines.map((line) => ({
      orderId: line.order_id,
      orderNumber: line.order_number,
      kind: line.kind,
      quantity: Number(line.quantity),
      pricing: line.pricing,
      label: line.label,
      covered: line.covered,
      amount: line.amount,
    })),
  };
}

/** The invoice that bills a deposit, if one does. */
export async function invoiceOfOrder(
  db: SqlExecutor,
  orderId: string,
): Promise<{ invoiceId: string; number: string } | null> {
  const { rows } = await db.query<{ invoice_id: string; number: string }>(
    `select i.invoice_id, i.number from invoice_orders l join invoices i on i.invoice_id = l.invoice_id
      where l.order_id = $1`,
    [orderId],
  );
  return rows[0] ? { invoiceId: rows[0].invoice_id, number: rows[0].number } : null;
}
