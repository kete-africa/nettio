import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import { randomBytes } from 'node:crypto';
import type { SendingOutcome } from '../domain/sending';

// Where a laundry's evening statement leaves to, and what its last sending became
// (specs/013-statement-sent). One line per organization, under row-level security.

/** A link token of a statement starts with this: a customer's link token never does. */
export const STATEMENT_TOKEN = 'rel_';

export function statementDeliveryMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  return `
create table ${s}.statement_delivery (
  organization_id text primary key,
  -- Off until the laundry turns it on: nothing leaves otherwise.
  enabled boolean not null default false,
  -- The hour of the day it leaves at, in universal time.
  hour integer not null default 20 check (hour between 0 and 23),
  language text not null default 'fr' check (language in ('fr', 'en')),
  email text not null default '' check (length(email) <= 254),
  whatsapp text not null default '' check (whatsapp = '' or whatsapp ~ '^\\+[0-9]{9,15}$'),
  -- The chat of whoever opened the bot with the statement's link; and that link's token.
  telegram_chat_id text,
  link_token text,
  last_sent_on date,
  last_outcome jsonb not null default '[]',
  updated_at timestamptz not null default now()
);
create unique index statement_delivery_token on ${s}.statement_delivery (link_token)
  where link_token is not null;
${organizationPolicySql({ schema: s, table: 'statement_delivery', appRole: options.appRole })}
grant select, insert, update on ${s}.statement_delivery to ${options.appRole};

-- Which laundries have a statement to send at this hour? The job has no organization yet: these
-- two functions answer with identifiers only — never an address, never a figure — and nothing
-- else crosses the organizations' boundary.
create function ${s}.statements_due(p_hour integer, p_day date)
  returns table (organization_id text)
  language sql security definer set search_path = ${s}
  as $$ select d.organization_id from ${s}.statement_delivery d
         where d.enabled and d.hour <= p_hour
           and (d.last_sent_on is null or d.last_sent_on < p_day)
           and (d.email <> '' or d.whatsapp <> '' or d.telegram_chat_id is not null) $$;
create function ${s}.statement_by_token(p_token text)
  returns table (organization_id text)
  language sql security definer set search_path = ${s}
  as $$ select d.organization_id from ${s}.statement_delivery d where d.link_token = p_token $$;
revoke all on function ${s}.statements_due(integer, date) from public;
revoke all on function ${s}.statement_by_token(text) from public;
grant execute on function ${s}.statements_due(integer, date) to ${options.appRole};
grant execute on function ${s}.statement_by_token(text) to ${options.appRole};
`;
}

export interface StatementDelivery {
  enabled: boolean;
  hour: number;
  language: 'fr' | 'en';
  email: string;
  whatsapp: string;
  telegramLinked: boolean;
  lastSentOn: string | null;
  lastOutcome: SendingOutcome[];
}

type Row = {
  enabled: boolean;
  hour: number;
  language: 'fr' | 'en';
  email: string;
  whatsapp: string;
  telegram_chat_id: string | null;
  last_sent_on: string | null;
  last_outcome: SendingOutcome[];
};

const COLUMNS = `enabled, hour, language, email, whatsapp, telegram_chat_id,
                 to_char(last_sent_on, 'YYYY-MM-DD') as last_sent_on, last_outcome`;

const read = (row: Row): StatementDelivery => ({
  enabled: row.enabled,
  hour: row.hour,
  language: row.language,
  email: row.email,
  whatsapp: row.whatsapp,
  telegramLinked: row.telegram_chat_id !== null,
  lastSentOn: row.last_sent_on,
  lastOutcome: row.last_outcome,
});

/** What the laundry decided; before it decided anything: off, at 20 h, to nowhere. */
export async function readDelivery(db: SqlExecutor): Promise<StatementDelivery> {
  const { rows } = await db.query<Row>(`select ${COLUMNS} from statement_delivery`);
  return rows[0]
    ? read(rows[0])
    : {
        enabled: false,
        hour: 20,
        language: 'fr',
        email: '',
        whatsapp: '',
        telegramLinked: false,
        lastSentOn: null,
        lastOutcome: [],
      };
}

/** The Telegram chat the statement leaves to, if one was linked. */
export async function telegramChatOf(db: SqlExecutor): Promise<string | null> {
  const { rows } = await db.query<{ telegram_chat_id: string | null }>(
    `select telegram_chat_id from statement_delivery`,
  );
  return rows[0]?.telegram_chat_id ?? null;
}

export async function saveDelivery(
  db: SqlExecutor,
  organizationId: string,
  input: {
    enabled: boolean;
    hour: number;
    language: 'fr' | 'en';
    email: string;
    whatsapp: string;
    /** Forgets the linked Telegram chat. */
    unlinkTelegram: boolean;
  },
): Promise<void> {
  await db.query(
    `insert into statement_delivery (organization_id, enabled, hour, language, email, whatsapp)
     values ($1, $2, $3, $4, $5, $6)
     on conflict (organization_id) do update
       set enabled = $2, hour = $3, language = $4, email = $5, whatsapp = $6,
           telegram_chat_id = case when $7 then null else statement_delivery.telegram_chat_id end,
           updated_at = now()`,
    [
      organizationId,
      input.enabled,
      input.hour,
      input.language,
      input.email,
      input.whatsapp,
      input.unlinkTelegram,
    ],
  );
}

/** The token of the link that ties a Telegram chat to this laundry's statement; made once. */
export async function statementTokenOf(db: SqlExecutor, organizationId: string): Promise<string> {
  const token = `${STATEMENT_TOKEN}${randomBytes(18).toString('base64url')}`;
  const { rows } = await db.query<{ link_token: string }>(
    `insert into statement_delivery (organization_id, link_token) values ($1, $2)
     on conflict (organization_id) do update
       set link_token = coalesce(statement_delivery.link_token, $2)
     returning link_token`,
    [organizationId, token],
  );
  return rows[0]?.link_token ?? token;
}

/** The laundry whose statement link carries this token (identifier only). */
export async function organizationOfStatementToken(
  lookup: SqlExecutor,
  token: string,
): Promise<string | null> {
  const { rows } = await lookup.query<{ organization_id: string }>(
    `select organization_id from statement_by_token($1)`,
    [token],
  );
  return rows[0]?.organization_id ?? null;
}

/** Ties the chat that opened the link; the link then stops working — it is used once. */
export async function linkStatementChat(
  db: SqlExecutor,
  token: string,
  chatId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ organization_id: string }>(
    `update statement_delivery set telegram_chat_id = $2, link_token = null, updated_at = now()
      where link_token = $1 returning organization_id`,
    [token, chatId],
  );
  return rows.length > 0;
}

/** The laundries whose statement is due at this hour of this day (identifiers only). */
export async function organizationsDue(
  lookup: SqlExecutor,
  input: { hour: number; day: string },
): Promise<string[]> {
  const { rows } = await lookup.query<{ organization_id: string }>(
    `select organization_id from statements_due($1, $2)`,
    [input.hour, input.day],
  );
  return rows.map((row) => row.organization_id);
}

/**
 * Takes the day's sending: true for the one caller that may send it. Two workers at the same
 * minute never send the same statement twice.
 */
export async function claimDay(db: SqlExecutor, day: string): Promise<boolean> {
  const { rows } = await db.query<{ organization_id: string }>(
    `update statement_delivery set last_sent_on = $1
      where last_sent_on is null or last_sent_on < $1 returning organization_id`,
    [day],
  );
  return rows.length > 0;
}

export async function noteOutcome(db: SqlExecutor, outcome: SendingOutcome[]): Promise<void> {
  await db.query(`update statement_delivery set last_outcome = $1`, [JSON.stringify(outcome)]);
}
