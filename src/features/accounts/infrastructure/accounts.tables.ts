import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import { RuleError } from '@/lib/rule-error';
import {
  balanceOf,
  checkSpend,
  type CreditKind,
  type PriceLine,
  type QuoteStatus,
  type Subscription,
} from '../domain/accounts';

// The tables of a customer's account (specs/026-accounts), each with its row-level security in
// this migration.

export function accountsMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
-- What the laundry agreed with a customer: a company's mentions, its invoice once a month.
create table ${s}.customer_terms (
  organization_id text not null,
  customer_id text not null references ${s}.customers (customer_id),
  legal_name text not null default '',
  tax_id text not null default '',
  address text not null default '',
  monthly_invoice boolean not null default false,
  -- Null: the laundry's usual delay.
  payment_days integer check (payment_days between 0 and 365),
  updated_at timestamptz not null default now(),
  primary key (organization_id, customer_id)
);
${secure('customer_terms', 'select, insert, update')}

-- A customer's own price for a service (and an article): it replaces the catalogue's for her.
create table ${s}.customer_prices (
  organization_id text not null,
  customer_id text not null references ${s}.customers (customer_id),
  service_id text not null,
  article_id text not null default '',
  amount integer not null check (amount >= 0),
  primary key (organization_id, customer_id, service_id, article_id)
);
${secure('customer_prices', 'select, insert, update, delete')}

create table ${s}.subscriptions (
  subscription_id text primary key,
  organization_id text not null,
  customer_id text not null references ${s}.customers (customer_id),
  name text not null check (length(name) between 1 and 80),
  amount integer not null check (amount > 0),
  credit integer not null check (credit >= amount),
  started_on date not null default current_date,
  ended_on date,
  created_by text not null,
  created_at timestamptz not null default now()
);
create index subscriptions_by_customer on ${s}.subscriptions (organization_id, customer_id);
${secure('subscriptions', 'select, insert, update')}

-- The credit a customer paid ahead: money in, deposits paid with it, credit given back by a
-- refund. Never changed nor deleted.
create table ${s}.credit_entries (
  entry_id text primary key,
  organization_id text not null,
  customer_id text not null references ${s}.customers (customer_id),
  kind text not null check (kind in ('top_up', 'spend', 'returned')),
  amount integer not null check (amount > 0),
  -- The money really received for a top-up; the rest is the laundry's bonus.
  cashed integer not null default 0 check (cashed >= 0 and cashed <= amount),
  method text not null default '',
  order_id text references ${s}.orders (order_id),
  cash_session_id text references ${s}.cash_sessions (session_id),
  subscription_id text references ${s}.subscriptions (subscription_id),
  period text,
  created_by text not null,
  created_at timestamptz not null default clock_timestamp(),
  -- A subscription's month is cashed once.
  unique (subscription_id, period)
);
create index credit_entries_by_customer on ${s}.credit_entries (organization_id, customer_id, created_at);
create index credit_entries_by_session on ${s}.credit_entries (cash_session_id) where cash_session_id is not null;
${secure('credit_entries', 'select, insert')}

create table ${s}.quote_counters (
  organization_id text not null,
  year integer not null,
  next_seq integer not null,
  primary key (organization_id, year)
);
${secure('quote_counters', 'select, insert, update')}

-- A quote says its prices as they were offered: a later change of the catalogue never touches it.
create table ${s}.quotes (
  quote_id text primary key,
  organization_id text not null,
  number text not null,
  customer_id text not null references ${s}.customers (customer_id),
  customer_name text not null,
  status text not null default 'open' check (status in ('open', 'accepted', 'refused')),
  valid_until date not null,
  note text not null default '',
  total integer not null check (total >= 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  unique (organization_id, number)
);
create index quotes_by_customer on ${s}.quotes (organization_id, customer_id, created_at);
${secure('quotes', 'select, insert, update')}

create table ${s}.quote_lines (
  line_id text primary key,
  organization_id text not null,
  quote_id text not null references ${s}.quotes (quote_id),
  position integer not null,
  service_name text not null,
  article_name text,
  pricing text not null check (pricing in ('per_piece', 'per_kg')),
  quantity numeric(10, 3) not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  amount integer not null check (amount >= 0)
);
create index quote_lines_by_quote on ${s}.quote_lines (quote_id, position);
${secure('quote_lines', 'select, insert')}

-- A deposit may be paid with the customer's credit; an invoice says a company's own mentions.
alter table ${s}.payments drop constraint payments_method_check;
alter table ${s}.payments add constraint payments_method_check
  check (method in ('cash', 'mobile_money', 'card', 'transfer', 'credit'));
alter table ${s}.invoices add column customer_mentions text not null default '';
`;
}

// ── Terms ────────────────────────────────────────────────────────────────────────────────────

export interface CustomerTerms {
  legalName: string;
  taxId: string;
  address: string;
  monthlyInvoice: boolean;
  paymentDays: number | null;
}

const NO_TERMS: CustomerTerms = { legalName: '', taxId: '', address: '', monthlyInvoice: false, paymentDays: null };

export async function readTerms(db: SqlExecutor, customerId: string): Promise<CustomerTerms> {
  const { rows } = await db.query<{
    legal_name: string;
    tax_id: string;
    address: string;
    monthly_invoice: boolean;
    payment_days: number | null;
  }>(
    `select legal_name, tax_id, address, monthly_invoice, payment_days from customer_terms where customer_id = $1`,
    [customerId],
  );
  const row = rows[0];
  return row
    ? {
        legalName: row.legal_name,
        taxId: row.tax_id,
        address: row.address,
        monthlyInvoice: row.monthly_invoice,
        paymentDays: row.payment_days,
      }
    : NO_TERMS;
}

export async function saveTerms(
  db: SqlExecutor,
  organizationId: string,
  customerId: string,
  terms: CustomerTerms,
): Promise<void> {
  await db.query(
    `insert into customer_terms (organization_id, customer_id, legal_name, tax_id, address, monthly_invoice, payment_days)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (organization_id, customer_id) do update
       set legal_name = $3, tax_id = $4, address = $5, monthly_invoice = $6, payment_days = $7, updated_at = now()`,
    [organizationId, customerId, terms.legalName, terms.taxId, terms.address, terms.monthlyInvoice, terms.paymentDays],
  );
}

/** The customers invoiced once a month. */
export async function monthlyCustomers(db: SqlExecutor): Promise<{ customerId: string; name: string }[]> {
  const { rows } = await db.query<{ customer_id: string; name: string }>(
    `select c.customer_id, c.name from customer_terms t join customers c on c.customer_id = t.customer_id
      where t.monthly_invoice order by c.name`,
  );
  return rows.map((row) => ({ customerId: row.customer_id, name: row.name }));
}

/** The deposits of a customer received in a period that are on no invoice yet. */
export async function uninvoicedIn(
  db: SqlExecutor,
  customerId: string,
  period: { from: string; to: string },
): Promise<string[]> {
  const { rows } = await db.query<{ order_id: string }>(
    `select o.order_id from orders o left join invoice_orders l on l.order_id = o.order_id
      where o.customer_id = $1 and o.status <> 'cancelled' and l.invoice_id is null
        and o.created_at >= $2::date and o.created_at < $3::date
      order by o.created_at, o.order_id`,
    [customerId, period.from, period.to],
  );
  return rows.map((row) => row.order_id);
}

// ── Prices ───────────────────────────────────────────────────────────────────────────────────

export async function customerPrices(db: SqlExecutor, customerId: string): Promise<PriceLine[]> {
  const { rows } = await db.query<{ service_id: string; article_id: string; amount: number }>(
    `select service_id, article_id, amount from customer_prices where customer_id = $1`,
    [customerId],
  );
  return rows.map((row) => ({ serviceId: row.service_id, articleId: row.article_id || null, amount: row.amount }));
}

/** Sets a customer's own price, or removes it (`amount` null): the catalogue's applies again. */
export async function saveCustomerPrice(
  db: SqlExecutor,
  organizationId: string,
  price: { customerId: string; serviceId: string; articleId: string | null; amount: number | null },
): Promise<void> {
  if (price.amount === null) {
    await db.query(`delete from customer_prices where customer_id = $1 and service_id = $2 and article_id = $3`, [
      price.customerId,
      price.serviceId,
      price.articleId ?? '',
    ]);
    return;
  }
  await db.query(
    `insert into customer_prices (organization_id, customer_id, service_id, article_id, amount)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id, customer_id, service_id, article_id) do update set amount = $5`,
    [organizationId, price.customerId, price.serviceId, price.articleId ?? '', price.amount],
  );
}

// ── Credit ───────────────────────────────────────────────────────────────────────────────────

export interface CreditEntry {
  entryId: string;
  kind: CreditKind;
  amount: number;
  cashed: number;
  method: string;
  orderNumber: string | null;
  subscriptionName: string | null;
  period: string | null;
  createdAt: Date;
}

export async function creditBalance(db: SqlExecutor, customerId: string): Promise<number> {
  const { rows } = await db.query<{ kind: CreditKind; amount: string }>(
    `select kind, sum(amount) as amount from credit_entries where customer_id = $1 group by kind`,
    [customerId],
  );
  return balanceOf(rows.map((row) => ({ kind: row.kind, amount: Number(row.amount) })));
}

export async function creditEntries(db: SqlExecutor, customerId: string): Promise<CreditEntry[]> {
  const { rows } = await db.query<{
    entry_id: string;
    kind: CreditKind;
    amount: number;
    cashed: number;
    method: string;
    number: string | null;
    subscription_name: string | null;
    period: string | null;
    created_at: Date;
  }>(
    `select e.entry_id, e.kind, e.amount, e.cashed, e.method, o.number, s.name as subscription_name, e.period,
            e.created_at
       from credit_entries e left join orders o on o.order_id = e.order_id
       left join subscriptions s on s.subscription_id = e.subscription_id
      where e.customer_id = $1 order by e.created_at desc limit 50`,
    [customerId],
  );
  return rows.map((row) => ({
    entryId: row.entry_id,
    kind: row.kind,
    amount: row.amount,
    cashed: row.cashed,
    method: row.method,
    orderNumber: row.number,
    subscriptionName: row.subscription_name,
    period: row.period,
    createdAt: row.created_at,
  }));
}

/** The person's open till, wherever it is: cash paid ahead goes into it. */
export async function openTillOf(db: SqlExecutor, cashierId: string): Promise<string | null> {
  const { rows } = await db.query<{ session_id: string }>(
    `select session_id from cash_sessions where cashier_id = $1 and closed_at is null
      order by opened_at desc limit 1`,
    [cashierId],
  );
  return rows[0]?.session_id ?? null;
}

export async function insertTopUp(
  db: SqlExecutor,
  organizationId: string,
  topUp: {
    customerId: string;
    credit: number;
    cashed: number;
    method: string;
    cashSessionId: string | null;
    subscriptionId?: string;
    period?: string;
    createdBy: string;
  },
): Promise<string | null> {
  const entryId = newId('crd');
  const { rows } = await db.query<{ entry_id: string }>(
    `insert into credit_entries (entry_id, organization_id, customer_id, kind, amount, cashed, method,
                                 cash_session_id, subscription_id, period, created_by)
     values ($1, $2, $3, 'top_up', $4, $5, $6, $7, $8, $9, $10)
     on conflict (subscription_id, period) do nothing returning entry_id`,
    [
      entryId,
      organizationId,
      topUp.customerId,
      topUp.credit,
      topUp.cashed,
      topUp.method,
      topUp.cashSessionId,
      topUp.subscriptionId ?? null,
      topUp.period ?? null,
      topUp.createdBy,
    ],
  );
  return rows[0]?.entry_id ?? null;
}

/**
 * A deposit paid with its customer's credit, or credit given back by a refund — written with the
 * payment, in its transaction. The customer is locked: two counters never spend the same credit.
 */
export async function moveCreditForPayment(
  db: SqlExecutor,
  organizationId: string,
  payment: { orderId: string; amount: number; refund: boolean; createdBy: string },
): Promise<void> {
  const { rows } = await db.query<{ customer_id: string }>(
    `select c.customer_id from customers c join orders o on o.customer_id = c.customer_id
      where o.order_id = $1 for update of c`,
    [payment.orderId],
  );
  const customerId = rows[0]?.customer_id;
  if (!customerId) throw new RuleError('not_found');
  if (!payment.refund) checkSpend(payment.amount, await creditBalance(db, customerId));
  await db.query(
    `insert into credit_entries (entry_id, organization_id, customer_id, kind, amount, method, order_id, created_by)
     values ($1, $2, $3, $4, $5, 'credit', $6, $7)`,
    [
      newId('crd'),
      organizationId,
      customerId,
      payment.refund ? 'returned' : 'spend',
      payment.amount,
      payment.orderId,
      payment.createdBy,
    ],
  );
}

// ── Subscriptions ────────────────────────────────────────────────────────────────────────────

type SubscriptionRow = {
  subscription_id: string;
  customer_id: string;
  name: string;
  amount: number;
  credit: number;
  started_on: string;
  ended_on: string | null;
};

const SUBSCRIPTION_COLUMNS = `s.subscription_id, s.customer_id, s.name, s.amount, s.credit,
  to_char(s.started_on, 'YYYY-MM-DD') as started_on, to_char(s.ended_on, 'YYYY-MM-DD') as ended_on`;

const toSubscription = (row: SubscriptionRow): Subscription => ({
  subscriptionId: row.subscription_id,
  customerId: row.customer_id,
  name: row.name,
  amount: row.amount,
  credit: row.credit,
  startedOn: row.started_on,
  endedOn: row.ended_on,
});

export async function insertSubscription(
  db: SqlExecutor,
  organizationId: string,
  subscription: { customerId: string; name: string; amount: number; credit: number; createdBy: string },
): Promise<string> {
  const subscriptionId = newId('sub');
  await db.query(
    `insert into subscriptions (subscription_id, organization_id, customer_id, name, amount, credit, created_by)
     values ($1, $2, $3, $4, $5, $6, $7)`,
    [
      subscriptionId,
      organizationId,
      subscription.customerId,
      subscription.name,
      subscription.amount,
      subscription.credit,
      subscription.createdBy,
    ],
  );
  return subscriptionId;
}

export async function findSubscription(db: SqlExecutor, subscriptionId: string): Promise<Subscription | null> {
  const { rows } = await db.query<SubscriptionRow>(
    `select ${SUBSCRIPTION_COLUMNS} from subscriptions s where s.subscription_id = $1 for update`,
    [subscriptionId],
  );
  return rows[0] ? toSubscription(rows[0]) : null;
}

export async function endSubscriptionOn(db: SqlExecutor, subscriptionId: string): Promise<boolean> {
  const { rows } = await db.query<{ subscription_id: string }>(
    `update subscriptions set ended_on = current_date where subscription_id = $1 and ended_on is null
     returning subscription_id`,
    [subscriptionId],
  );
  return rows.length > 0;
}

/** The subscriptions of a customer (or of everyone), each with whether a month was cashed. */
export async function listSubscriptions(
  db: SqlExecutor,
  filter: { customerId?: string | undefined; period: string },
): Promise<(Subscription & { customerName: string; cashed: boolean })[]> {
  const { rows } = await db.query<SubscriptionRow & { customer_name: string; cashed: boolean }>(
    `select ${SUBSCRIPTION_COLUMNS}, c.name as customer_name,
            exists (select 1 from credit_entries e
                     where e.subscription_id = s.subscription_id and e.period = $2) as cashed
       from subscriptions s join customers c on c.customer_id = s.customer_id
      where ($1::text is null or s.customer_id = $1)
      order by s.ended_on nulls first, c.name, s.created_at limit 200`,
    [filter.customerId ?? null, filter.period],
  );
  return rows.map((row) => ({ ...toSubscription(row), customerName: row.customer_name, cashed: row.cashed }));
}

// ── Quotes ───────────────────────────────────────────────────────────────────────────────────

export interface QuoteLine {
  serviceName: string;
  articleName: string | null;
  pricing: 'per_piece' | 'per_kg';
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface QuoteSummary {
  quoteId: string;
  number: string;
  customerId: string;
  customerName: string;
  status: QuoteStatus;
  validUntil: string;
  total: number;
  createdAt: Date;
}

export interface Quote extends QuoteSummary {
  note: string;
  lines: QuoteLine[];
}

export async function takeQuoteNumber(db: SqlExecutor, organizationId: string, year: number): Promise<number> {
  const { rows } = await db.query<{ seq: number }>(
    `insert into quote_counters (organization_id, year, next_seq) values ($1, $2, 2)
     on conflict (organization_id, year) do update set next_seq = quote_counters.next_seq + 1
     returning next_seq - 1 as seq`,
    [organizationId, year],
  );
  return rows[0]?.seq ?? 1;
}

export async function insertQuote(
  db: SqlExecutor,
  organizationId: string,
  quote: {
    number: string;
    customerId: string;
    customerName: string;
    validUntil: string;
    note: string;
    total: number;
    createdBy: string;
    lines: QuoteLine[];
  },
): Promise<string> {
  const quoteId = newId('quo');
  await db.query(
    `insert into quotes (quote_id, organization_id, number, customer_id, customer_name, valid_until, note, total, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      quoteId,
      organizationId,
      quote.number,
      quote.customerId,
      quote.customerName,
      quote.validUntil,
      quote.note,
      quote.total,
      quote.createdBy,
    ],
  );
  for (const [position, line] of quote.lines.entries()) {
    await db.query(
      `insert into quote_lines (line_id, organization_id, quote_id, position, service_name, article_name, pricing,
                                quantity, unit_price, amount)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        newId('qli'),
        organizationId,
        quoteId,
        position,
        line.serviceName,
        line.articleName,
        line.pricing,
        line.quantity,
        line.unitPrice,
        line.amount,
      ],
    );
  }
  return quoteId;
}

type QuoteRow = {
  quote_id: string;
  number: string;
  customer_id: string;
  customer_name: string;
  status: QuoteStatus;
  valid_until: string;
  total: number;
  note: string;
  created_at: Date;
};

const QUOTE_COLUMNS = `quote_id, number, customer_id, customer_name, status,
  to_char(valid_until, 'YYYY-MM-DD') as valid_until, total, note, created_at`;

const toQuote = (row: QuoteRow): QuoteSummary => ({
  quoteId: row.quote_id,
  number: row.number,
  customerId: row.customer_id,
  customerName: row.customer_name,
  status: row.status,
  validUntil: row.valid_until,
  total: row.total,
  createdAt: row.created_at,
});

export async function listQuotes(db: SqlExecutor, customerId?: string): Promise<QuoteSummary[]> {
  const { rows } = await db.query<QuoteRow>(
    `select ${QUOTE_COLUMNS} from quotes where ($1::text is null or customer_id = $1)
      order by created_at desc limit 100`,
    [customerId ?? null],
  );
  return rows.map(toQuote);
}

export async function findQuote(db: SqlExecutor, quoteId: string, lock = false): Promise<Quote | null> {
  const { rows } = await db.query<QuoteRow>(
    `select ${QUOTE_COLUMNS} from quotes where quote_id = $1 ${lock ? 'for update' : ''}`,
    [quoteId],
  );
  const row = rows[0];
  if (!row) return null;
  const lines = await db.query<{
    service_name: string;
    article_name: string | null;
    pricing: 'per_piece' | 'per_kg';
    quantity: string;
    unit_price: number;
    amount: number;
  }>(
    `select service_name, article_name, pricing, quantity, unit_price, amount from quote_lines
      where quote_id = $1 order by position`,
    [quoteId],
  );
  return {
    ...toQuote(row),
    note: row.note,
    lines: lines.rows.map((line) => ({
      serviceName: line.service_name,
      articleName: line.article_name,
      pricing: line.pricing,
      quantity: Number(line.quantity),
      unitPrice: line.unit_price,
      amount: line.amount,
    })),
  };
}

export async function decideQuoteAs(db: SqlExecutor, quoteId: string, status: 'accepted' | 'refused'): Promise<void> {
  await db.query(`update quotes set status = $2, decided_at = now() where quote_id = $1 and status = 'open'`, [
    quoteId,
    status,
  ]);
}
