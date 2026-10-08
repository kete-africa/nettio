import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { Customer, CustomerChannel, CustomerKind } from '../customer.record';

/** The customers' table, with its row-level security in the same migration. */
export function customersMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  return `
-- The country prefix a local phone number takes (228: Togo).
alter table ${s}.settings
  add column phone_prefix text not null default '228' check (phone_prefix ~ '^[0-9]{1,4}$');

create table ${s}.customers (
  customer_id text primary key,
  organization_id text not null,
  phone text not null check (phone ~ '^\\+[0-9]{9,15}$'),
  name text not null check (length(name) between 1 and 120),
  kind text not null default 'person' check (kind in ('person', 'business')),
  channel text not null default 'whatsapp' check (channel in ('whatsapp', 'telegram', 'sms', 'none')),
  consent boolean not null default true,
  preferences text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (organization_id, phone)
);
create index customers_by_name on ${s}.customers (organization_id, lower(name));
${organizationPolicySql({ schema: s, table: 'customers', appRole: options.appRole })}
grant select, insert, update on ${s}.customers to ${options.appRole};
`;
}

type Row = {
  customer_id: string;
  phone: string;
  name: string;
  kind: CustomerKind;
  channel: CustomerChannel;
  consent: boolean;
  preferences: string;
  note: string;
  created_at: Date;
};

const columns = `customer_id, phone, name, kind, channel, consent, preferences, note, created_at`;

const toCustomer = (row: Row): Customer => ({
  customerId: row.customer_id,
  phone: row.phone,
  name: row.name,
  kind: row.kind,
  channel: row.channel,
  consent: row.consent,
  preferences: row.preferences,
  note: row.note,
  createdAt: row.created_at,
});

export async function findCustomer(db: SqlExecutor, customerId: string): Promise<Customer | null> {
  const { rows } = await db.query<Row>(
    `select ${columns} from customers where customer_id = $1`,
    [customerId],
  );
  return rows[0] ? toCustomer(rows[0]) : null;
}

export async function findCustomerByPhone(db: SqlExecutor, phone: string): Promise<Customer | null> {
  const { rows } = await db.query<Row>(`select ${columns} from customers where phone = $1`, [phone]);
  return rows[0] ? toCustomer(rows[0]) : null;
}

/** Customers whose name or phone contains the text (or all), the latest first. */
export async function searchCustomers(
  db: SqlExecutor,
  query: { text?: string | undefined; limit: number },
): Promise<Customer[]> {
  const text = query.text?.trim() || null;
  const digits = text?.replace(/\D/g, '') || null;
  const { rows } = await db.query<Row>(
    `select ${columns} from customers
      where $1::text is null
         or name ilike '%' || $1 || '%'
         or ($2::text is not null and phone like '%' || $2 || '%')
      order by created_at desc limit $3`,
    [text, digits, query.limit],
  );
  return rows.map(toCustomer);
}

export async function insertCustomer(
  db: SqlExecutor,
  organizationId: string,
  customer: Omit<Customer, 'customerId' | 'createdAt'>,
): Promise<Customer> {
  const { rows } = await db.query<Row>(
    `insert into customers (customer_id, organization_id, phone, name, kind, channel, consent,
                            preferences, note)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning ${columns}`,
    [
      newId('cus'),
      organizationId,
      customer.phone,
      customer.name,
      customer.kind,
      customer.channel,
      customer.consent,
      customer.preferences,
      customer.note,
    ],
  );
  return toCustomer(rows[0] as Row);
}

export async function updateCustomer(
  db: SqlExecutor,
  customer: Omit<Customer, 'createdAt'>,
): Promise<Customer | null> {
  const { rows } = await db.query<Row>(
    `update customers set phone = $2, name = $3, kind = $4, channel = $5, consent = $6,
            preferences = $7, note = $8
      where customer_id = $1 returning ${columns}`,
    [
      customer.customerId,
      customer.phone,
      customer.name,
      customer.kind,
      customer.channel,
      customer.consent,
      customer.preferences,
      customer.note,
    ],
  );
  return rows[0] ? toCustomer(rows[0]) : null;
}
