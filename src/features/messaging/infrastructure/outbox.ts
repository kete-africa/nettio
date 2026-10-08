import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import { randomBytes } from 'node:crypto';
import {
  renderTemplate,
  routeFor,
  sayDate,
  sayMoney,
  type CustomerChannelChoice,
  type MessageKind,
  type Placeholder,
} from '../domain/messages';

// The messages of a laundry to its customers: its templates, and every message — sent, failed,
// not sent — with its reason. This file imports nothing of the orders nor workshop features: they
// queue a message through it when a deposit is received or becomes ready.

/** The messaging tables, each with its row-level security in the same migration. */
export function messagingMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
-- A customer's Telegram chat, once she opened the laundry's bot; and the token of her link.
alter table ${s}.customers
  add column telegram_chat_id text,
  add column link_token text;
create unique index customers_link_token on ${s}.customers (link_token) where link_token is not null;
create index customers_telegram_chat on ${s}.customers (telegram_chat_id)
  where telegram_chat_id is not null;

-- What the laundry decided for each kind of message: off until it turns it on, with its own words.
create table ${s}.message_templates (
  organization_id text not null,
  kind text not null check (kind in ('receipt', 'ready', 'reminder')),
  enabled boolean not null default false,
  body text not null check (length(body) between 1 and 1000),
  -- The approved template of the same words at the messaging provider, when it asks for one.
  provider_template text not null default '',
  updated_at timestamptz not null default now(),
  primary key (organization_id, kind)
);
${secure('message_templates', 'select, insert, update')}

create table ${s}.messages (
  message_id text primary key,
  organization_id text not null,
  customer_id text not null references ${s}.customers (customer_id),
  order_id text references ${s}.orders (order_id),
  direction text not null default 'out' check (direction in ('out', 'in')),
  kind text not null check (kind in ('receipt', 'ready', 'reminder', 'reply', 'inbound')),
  channel text not null check (channel in ('whatsapp', 'telegram', 'none')),
  recipient text not null default '',
  body text not null,
  -- The values of the placeholders, in their order, for a provider's approved template.
  parameters jsonb not null default '[]',
  provider_template text not null default '',
  status text not null check (status in ('queued', 'sent', 'failed', 'skipped', 'received')),
  reason text not null default '',
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index messages_queued on ${s}.messages (organization_id, created_at) where status = 'queued';
create index messages_by_order on ${s}.messages (order_id, created_at);
create index messages_latest on ${s}.messages (organization_id, created_at desc);
${secure('messages', 'select, insert, update')}

-- Which laundry does a sender belong to? A webhook has no organization yet: these three functions
-- answer with identifiers only — never a name, a phone nor a message — and nothing else crosses
-- the organizations' boundary.
create function ${s}.messaging_customers_by_phone(p_phone text)
  returns table (organization_id text, customer_id text)
  language sql security definer set search_path = ${s}
  as $$ select c.organization_id, c.customer_id from ${s}.customers c where c.phone = p_phone $$;
create function ${s}.messaging_customers_by_chat(p_chat text)
  returns table (organization_id text, customer_id text)
  language sql security definer set search_path = ${s}
  as $$ select c.organization_id, c.customer_id from ${s}.customers c where c.telegram_chat_id = p_chat $$;
create function ${s}.messaging_customer_by_token(p_token text)
  returns table (organization_id text, customer_id text)
  language sql security definer set search_path = ${s}
  as $$ select c.organization_id, c.customer_id from ${s}.customers c where c.link_token = p_token $$;
revoke all on function ${s}.messaging_customers_by_phone(text) from public;
revoke all on function ${s}.messaging_customers_by_chat(text) from public;
revoke all on function ${s}.messaging_customer_by_token(text) from public;
grant execute on function ${s}.messaging_customers_by_phone(text) to ${options.appRole};
grant execute on function ${s}.messaging_customers_by_chat(text) to ${options.appRole};
grant execute on function ${s}.messaging_customer_by_token(text) to ${options.appRole};
`;
}

export interface MessageTemplate {
  kind: MessageKind;
  enabled: boolean;
  body: string;
  providerTemplate: string;
}

export async function listTemplates(db: SqlExecutor): Promise<MessageTemplate[]> {
  const { rows } = await db.query<{
    kind: MessageKind;
    enabled: boolean;
    body: string;
    provider_template: string;
  }>(`select kind, enabled, body, provider_template from message_templates`);
  return rows.map((row) => ({
    kind: row.kind,
    enabled: row.enabled,
    body: row.body,
    providerTemplate: row.provider_template,
  }));
}

export async function saveTemplate(
  db: SqlExecutor,
  organizationId: string,
  template: MessageTemplate,
): Promise<void> {
  await db.query(
    `insert into message_templates (organization_id, kind, enabled, body, provider_template)
     values ($1, $2, $3, $4, $5)
     on conflict (organization_id, kind) do update
       set enabled = excluded.enabled, body = excluded.body,
           provider_template = excluded.provider_template, updated_at = now()`,
    [organizationId, template.kind, template.enabled, template.body, template.providerTemplate],
  );
}

export type MessageStatus = 'queued' | 'sent' | 'failed' | 'skipped' | 'received';

export interface Message {
  messageId: string;
  customerId: string;
  customerName: string;
  orderId: string | null;
  number: string | null;
  direction: 'out' | 'in';
  kind: MessageKind | 'reply' | 'inbound';
  channel: 'whatsapp' | 'telegram' | 'none';
  body: string;
  status: MessageStatus;
  reason: string;
  createdAt: Date;
  sentAt: Date | null;
}

type MessageRow = {
  message_id: string;
  customer_id: string;
  customer_name: string;
  order_id: string | null;
  number: string | null;
  direction: 'out' | 'in';
  kind: Message['kind'];
  channel: Message['channel'];
  body: string;
  status: MessageStatus;
  reason: string;
  created_at: Date;
  sent_at: Date | null;
};

export async function listMessages(
  db: SqlExecutor,
  query: { orderId?: string | undefined; limit: number },
): Promise<Message[]> {
  const { rows } = await db.query<MessageRow>(
    `select msg.message_id, msg.customer_id, c.name as customer_name, msg.order_id, o.number,
            msg.direction, msg.kind, msg.channel, msg.body, msg.status, msg.reason, msg.created_at,
            msg.sent_at
       from messages msg join customers c using (customer_id)
       left join orders o on o.order_id = msg.order_id
      where ($1::text is null or msg.order_id = $1)
      order by msg.created_at desc limit $2`,
    [query.orderId ?? null, query.limit],
  );
  return rows.map((row) => ({
    messageId: row.message_id,
    customerId: row.customer_id,
    customerName: row.customer_name,
    orderId: row.order_id,
    number: row.number,
    direction: row.direction,
    kind: row.kind,
    channel: row.channel,
    body: row.body,
    status: row.status,
    reason: row.reason,
    createdAt: row.created_at,
    sentAt: row.sent_at,
  }));
}

/** What a message needs of a deposit and of its customer, read at once. */
async function orderFacts(db: SqlExecutor, orderId: string) {
  const { rows } = await db.query<{
    customer_id: string;
    name: string;
    phone: string;
    channel: CustomerChannelChoice;
    consent: boolean;
    telegram_chat_id: string | null;
    number: string;
    total: number;
    paid: number;
    promised_at: Date;
    pack_name: string | null;
    business_name: string;
    content: string | null;
  }>(
    `select c.customer_id, c.name, c.phone, c.channel, c.consent, c.telegram_chat_id, o.number,
            o.total, o.paid, o.promised_at, o.pack_name, s.business_name,
            (select string_agg(trim(to_char(i.quantity, 'FM999990.###'), '.') ||
                               case when i.pricing = 'per_kg' then ' kg ' else ' ' end ||
                               coalesce(i.article_name, i.service_name), ', ' order by i.position)
               from order_items i where i.order_id = o.order_id) as content
       from orders o join customers c using (customer_id) cross join settings s
      where o.order_id = $1`,
    [orderId],
  );
  return rows[0] ?? null;
}

/**
 * Queues a message of a kind for a deposit — when the laundry turned that kind on. The words are
 * the laundry's, the figures are the deposit's. A customer who did not consent, or cannot be
 * reached, gets a row that says why nothing left. Returns whether something waits to be sent.
 */
export async function queueOrderMessage(
  db: SqlExecutor,
  organizationId: string,
  input: { orderId: string; kind: MessageKind },
): Promise<boolean> {
  const template = (await listTemplates(db)).find((t) => t.kind === input.kind);
  if (!template?.enabled) return false;
  const facts = await orderFacts(db, input.orderId);
  if (!facts) return false;
  const values: Record<Placeholder, string> = {
    client: facts.name,
    numero: facts.number,
    contenu: facts.pack_name ? `${facts.content ?? ''} (${facts.pack_name})` : (facts.content ?? ''),
    total: sayMoney(facts.total),
    paye: sayMoney(facts.paid),
    reste: sayMoney(facts.total - facts.paid),
    date: sayDate(facts.promised_at),
    pressing: facts.business_name,
  };
  const route = routeFor({
    phone: facts.phone,
    channel: facts.channel,
    consent: facts.consent,
    telegramChatId: facts.telegram_chat_id,
  });
  await db.query(
    `insert into messages (message_id, organization_id, customer_id, order_id, kind, channel,
                           recipient, body, parameters, provider_template, status, reason)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
    [
      newId('msg'),
      organizationId,
      facts.customer_id,
      input.orderId,
      input.kind,
      route.send ? route.channel : 'none',
      route.send ? route.to : '',
      renderTemplate(template.body, values),
      JSON.stringify(Object.values(values)),
      template.providerTemplate,
      route.send ? 'queued' : 'skipped',
      route.send ? '' : route.reason,
    ],
  );
  return route.send;
}

export interface QueuedMessage {
  messageId: string;
  orderId: string | null;
  kind: Message['kind'];
  channel: 'whatsapp' | 'telegram';
  recipient: string;
  body: string;
  parameters: string[];
  providerTemplate: string;
}

/** The messages waiting to leave, the oldest first, locked for this delivery. */
export async function takeQueued(db: SqlExecutor, limit: number): Promise<QueuedMessage[]> {
  const { rows } = await db.query<{
    message_id: string;
    order_id: string | null;
    kind: Message['kind'];
    channel: 'whatsapp' | 'telegram';
    recipient: string;
    body: string;
    parameters: string[];
    provider_template: string;
  }>(
    `select message_id, order_id, kind, channel, recipient, body, parameters, provider_template
       from messages where status = 'queued' and channel <> 'none'
      order by created_at limit $1 for update skip locked`,
    [limit],
  );
  return rows.map((row) => ({
    messageId: row.message_id,
    orderId: row.order_id,
    kind: row.kind,
    channel: row.channel,
    recipient: row.recipient,
    body: row.body,
    parameters: row.parameters,
    providerTemplate: row.provider_template,
  }));
}

export async function markMessage(
  db: SqlExecutor,
  messageId: string,
  outcome: { status: 'sent' } | { status: 'failed' | 'queued'; reason: string },
): Promise<void> {
  await db.query(
    `update messages set status = $2, reason = $3, attempts = attempts + 1,
            sent_at = case when $2 = 'sent' then now() else sent_at end
      where message_id = $1`,
    [messageId, outcome.status, outcome.status === 'sent' ? '' : outcome.reason],
  );
}

/** Puts a failed message back in the queue. */
export async function requeue(db: SqlExecutor, messageId: string): Promise<boolean> {
  const { rows } = await db.query(
    `update messages set status = 'queued', reason = ''
      where message_id = $1 and status = 'failed' and direction = 'out' returning message_id`,
    [messageId],
  );
  return rows.length > 0;
}

/** Notes what a customer wrote, and what the laundry answered. */
export async function noteExchange(
  db: SqlExecutor,
  organizationId: string,
  exchange: {
    customerId: string;
    channel: 'whatsapp' | 'telegram';
    recipient: string;
    heard: string;
    answer: string | null;
  },
): Promise<void> {
  await db.query(
    `insert into messages (message_id, organization_id, customer_id, direction, kind, channel,
                           recipient, body, status)
     values ($1, $2, $3, 'in', 'inbound', $4, $5, $6, 'received')`,
    [
      newId('msg'),
      organizationId,
      exchange.customerId,
      exchange.channel,
      exchange.recipient,
      exchange.heard.slice(0, 1000),
    ],
  );
  if (exchange.answer) {
    await db.query(
      `insert into messages (message_id, organization_id, customer_id, kind, channel, recipient,
                             body, status)
       values ($1, $2, $3, 'reply', $4, $5, $6, 'queued')`,
      [
        newId('msg'),
        organizationId,
        exchange.customerId,
        exchange.channel,
        exchange.recipient,
        exchange.answer,
      ],
    );
  }
}

/** The ready deposits of the laundry with when they were last chased: what a reminder round reads. */
export async function sleepingOrders(
  db: SqlExecutor,
): Promise<{ orderId: string; readyAt: Date; lastRemindedAt: Date | null }[]> {
  const { rows } = await db.query<{ order_id: string; ready_at: Date; last: Date | null }>(
    `select o.order_id, o.ready_at,
            (select max(msg.created_at) from messages msg
              where msg.order_id = o.order_id and msg.kind = 'reminder'
                and msg.status <> 'skipped') as last
       from orders o where o.status = 'ready' and o.ready_at is not null`,
  );
  return rows.map((row) => ({ orderId: row.order_id, readyAt: row.ready_at, lastRemindedAt: row.last }));
}

/** The open deposits of a customer, as an answer to « where is my order? » needs them. */
export async function openOrdersOf(
  db: SqlExecutor,
  customerId: string,
): Promise<
  { number: string; status: 'received' | 'in_progress' | 'ready'; promisedAt: Date; balance: number }[]
> {
  const { rows } = await db.query<{
    number: string;
    status: 'received' | 'in_progress' | 'ready';
    promised_at: Date;
    balance: number;
  }>(
    `select number, status, promised_at, total - paid as balance from orders
      where customer_id = $1 and status in ('received', 'in_progress', 'ready')
      order by created_at desc limit 5`,
    [customerId],
  );
  return rows.map((row) => ({
    number: row.number,
    status: row.status,
    promisedAt: row.promised_at,
    balance: row.balance,
  }));
}

/** The link a customer opens to receive her messages on Telegram: its token, made once. */
export async function linkTokenOf(db: SqlExecutor, customerId: string): Promise<string> {
  const { rows } = await db.query<{ link_token: string | null }>(
    `select link_token from customers where customer_id = $1`,
    [customerId],
  );
  if (rows[0]?.link_token) return rows[0].link_token;
  const token = randomBytes(12).toString('base64url');
  await db.query(`update customers set link_token = $2 where customer_id = $1`, [customerId, token]);
  return token;
}

export async function linkTelegram(db: SqlExecutor, customerId: string, chatId: string): Promise<void> {
  await db.query(
    `update customers set telegram_chat_id = $2, channel = 'telegram', consent = true
      where customer_id = $1`,
    [customerId, chatId],
  );
}

export async function withdrawConsent(db: SqlExecutor, customerId: string): Promise<void> {
  await db.query(`update customers set consent = false where customer_id = $1`, [customerId]);
}

/** Whose sender is this? Identifiers only, across organizations (see the migration). */
export async function customersOfSender(
  db: SqlExecutor,
  sender: { channel: 'whatsapp'; phone: string } | { channel: 'telegram'; chatId: string },
): Promise<{ organizationId: string; customerId: string }[]> {
  const { rows } = await db.query<{ organization_id: string; customer_id: string }>(
    sender.channel === 'whatsapp'
      ? `select organization_id, customer_id from messaging_customers_by_phone($1)`
      : `select organization_id, customer_id from messaging_customers_by_chat($1)`,
    [sender.channel === 'whatsapp' ? sender.phone : sender.chatId],
  );
  return rows.map((row) => ({ organizationId: row.organization_id, customerId: row.customer_id }));
}

export async function customerOfToken(
  db: SqlExecutor,
  token: string,
): Promise<{ organizationId: string; customerId: string } | null> {
  const { rows } = await db.query<{ organization_id: string; customer_id: string }>(
    `select organization_id, customer_id from messaging_customer_by_token($1)`,
    [token],
  );
  return rows[0] ? { organizationId: rows[0].organization_id, customerId: rows[0].customer_id } : null;
}

export async function businessNameOf(db: SqlExecutor): Promise<string> {
  const { rows } = await db.query<{ business_name: string }>(`select business_name from settings`);
  return rows[0]?.business_name ?? '';
}
