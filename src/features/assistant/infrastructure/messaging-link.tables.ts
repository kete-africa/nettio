import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import { randomBytes } from 'node:crypto';

// A person of the team who asks Nettio from her own WhatsApp or Telegram
// (specs/023-ask-by-messaging): the address she tied herself, by sending a token only she was
// shown. One line per person, under row-level security.

/** A token that ties a person's messaging starts with this: no other link token does. */
export const ASK_TOKEN = 'ask_';

export type AskChannel = 'whatsapp' | 'telegram';

export function messagingLinkMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  return `
create table ${s}.staff_messaging (
  organization_id text not null,
  user_id text not null,
  -- The chat that sent the token on Telegram; the phone that sent it on WhatsApp (digits).
  telegram_chat_id text,
  whatsapp_phone text,
  link_token text,
  updated_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);
create unique index staff_messaging_token on ${s}.staff_messaging (link_token)
  where link_token is not null;
create index staff_messaging_telegram on ${s}.staff_messaging (telegram_chat_id)
  where telegram_chat_id is not null;
create index staff_messaging_whatsapp on ${s}.staff_messaging (whatsapp_phone)
  where whatsapp_phone is not null;
${organizationPolicySql({ schema: s, table: 'staff_messaging', appRole: options.appRole })}
grant select, insert, update on ${s}.staff_messaging to ${options.appRole};

-- Who writes? A webhook has no organization yet: these two functions answer with identifiers
-- only — an organization and a person — and nothing else crosses the organizations' boundary.
create function ${s}.staff_by_messaging_token(p_token text)
  returns table (organization_id text, user_id text)
  language sql security definer set search_path = ${s}
  as $$ select m.organization_id, m.user_id from ${s}.staff_messaging m where m.link_token = p_token $$;
create function ${s}.staff_by_messaging_address(p_channel text, p_address text)
  returns table (organization_id text, user_id text)
  language sql security definer set search_path = ${s}
  as $$ select m.organization_id, m.user_id from ${s}.staff_messaging m
         where (p_channel = 'telegram' and m.telegram_chat_id = p_address)
            or (p_channel = 'whatsapp' and m.whatsapp_phone = p_address) $$;
revoke all on function ${s}.staff_by_messaging_token(text) from public;
revoke all on function ${s}.staff_by_messaging_address(text, text) from public;
grant execute on function ${s}.staff_by_messaging_token(text) to ${options.appRole};
grant execute on function ${s}.staff_by_messaging_address(text, text) to ${options.appRole};
`;
}

export interface MessagingLink {
  telegram: boolean;
  whatsapp: boolean;
}

export async function readMessagingLink(db: SqlExecutor, userId: string): Promise<MessagingLink> {
  const { rows } = await db.query<{ telegram_chat_id: string | null; whatsapp_phone: string | null }>(
    `select telegram_chat_id, whatsapp_phone from staff_messaging where user_id = $1`,
    [userId],
  );
  return { telegram: Boolean(rows[0]?.telegram_chat_id), whatsapp: Boolean(rows[0]?.whatsapp_phone) };
}

/** The token a person sends from her messaging to tie it; made once, kept until she unlinks. */
export async function messagingTokenOf(
  db: SqlExecutor,
  organizationId: string,
  userId: string,
): Promise<string> {
  const token = `${ASK_TOKEN}${randomBytes(18).toString('base64url')}`;
  const { rows } = await db.query<{ link_token: string }>(
    `insert into staff_messaging (organization_id, user_id, link_token) values ($1, $2, $3)
     on conflict (organization_id, user_id) do update
       set link_token = coalesce(staff_messaging.link_token, $3)
     returning link_token`,
    [organizationId, userId, token],
  );
  return rows[0]?.link_token ?? token;
}

/** The person whose token this is (identifiers only). */
export async function personOfMessagingToken(
  lookup: SqlExecutor,
  token: string,
): Promise<{ organizationId: string; userId: string } | null> {
  const { rows } = await lookup.query<{ organization_id: string; user_id: string }>(
    `select organization_id, user_id from staff_by_messaging_token($1)`,
    [token],
  );
  return rows[0] ? { organizationId: rows[0].organization_id, userId: rows[0].user_id } : null;
}

/** The people who tied this address (identifiers only): one, unless she works in two laundries. */
export async function peopleOfAddress(
  lookup: SqlExecutor,
  channel: AskChannel,
  address: string,
): Promise<{ organizationId: string; userId: string }[]> {
  const { rows } = await lookup.query<{ organization_id: string; user_id: string }>(
    `select organization_id, user_id from staff_by_messaging_address($1, $2)`,
    [channel, address],
  );
  return rows.map((row) => ({ organizationId: row.organization_id, userId: row.user_id }));
}

/** Ties the address that sent the token to the person it was shown to. */
export async function tieAddress(
  db: SqlExecutor,
  token: string,
  channel: AskChannel,
  address: string,
): Promise<boolean> {
  const column = channel === 'telegram' ? 'telegram_chat_id' : 'whatsapp_phone';
  const { rows } = await db.query<{ user_id: string }>(
    `update staff_messaging set ${column} = $2, updated_at = now() where link_token = $1 returning user_id`,
    [token, address],
  );
  return rows.length > 0;
}

/** Forgets a person's messaging, and her token: a new one is made if she ties it again. */
export async function untieMessaging(db: SqlExecutor, userId: string): Promise<void> {
  await db.query(
    `update staff_messaging
        set telegram_chat_id = null, whatsapp_phone = null, link_token = null, updated_at = now()
      where user_id = $1`,
    [userId],
  );
}
