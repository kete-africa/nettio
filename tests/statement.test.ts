import { renderEmail } from '@kete/notify';
import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  organizationsDue,
  sendDueStatement,
  type SendingOutcome,
  type SendingPorts,
} from '../src/features/assistant';
import {
  asMessage,
  asOneValue,
  destinationsOf,
  statementIsDue,
} from '../src/features/assistant/domain/sending';
import type { StatementDelivery } from '../src/features/assistant/infrastructure/delivery.tables';
import type { StatementMail } from '../src/features/assistant/sending';
import { statementEmail } from '../src/features/assistant/ui/statement-email';
import { ChannelError, type Channels, type CustomerChannel } from '../src/features/messaging/ports';
import { useChannels } from '../src/platform/channels';
import { getPool, transaction } from '../src/platform/db';
import { telegramWebhook } from '../src/platform/inbound';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { useSendingPorts } from '../src/platform/statement';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// The evening statement sent by itself (specs/013-statement-sent): off until the owner turns it
// on, to where she decided, once a day, and what it became on each channel is said. The channels
// are recorded fakes — never the live services.

const choice = { enabled: true, hour: 20, email: 'afi@example.test', whatsapp: '', telegramLinked: false };

describe('when a statement is due, a pure function', () => {
  const at = (iso: string) => new Date(iso);

  it('goes to the destinations the laundry gave, in a fixed order', () => {
    expect(destinationsOf(choice)).toEqual(['email']);
    expect(destinationsOf({ ...choice, whatsapp: '+22890123456', telegramLinked: true })).toEqual([
      'email',
      'whatsapp',
      'telegram',
    ]);
    expect(destinationsOf({ ...choice, email: '' })).toEqual([]);
  });

  it('is due once its hour is reached, and not before', () => {
    expect(statementIsDue({ ...choice, lastSentOn: null }, at('2026-10-08T19:59:00Z'))).toBe(false);
    expect(statementIsDue({ ...choice, lastSentOn: null }, at('2026-10-08T20:05:00Z'))).toBe(true);
  });

  it('is sent once a day: an hour that was missed is caught up, a sent day is not sent again', () => {
    expect(statementIsDue({ ...choice, lastSentOn: '2026-10-07' }, at('2026-10-08T23:05:00Z'))).toBe(true);
    expect(statementIsDue({ ...choice, lastSentOn: '2026-10-08' }, at('2026-10-08T23:05:00Z'))).toBe(false);
    // The day after, before the hour: yesterday's statement is not sent late.
    expect(statementIsDue({ ...choice, lastSentOn: '2026-10-06' }, at('2026-10-08T08:00:00Z'))).toBe(false);
  });

  it('never leaves when it is off, or has nowhere to go', () => {
    const late = at('2026-10-08T22:00:00Z');
    expect(statementIsDue({ ...choice, enabled: false, lastSentOn: null }, late)).toBe(false);
    expect(statementIsDue({ ...choice, email: '', lastSentOn: null }, late)).toBe(false);
  });

  it('is said as a message, or as one value a provider’s template accepts', () => {
    const lines = ['Encaissé aujourd’hui : 1 500 F CFA.', '  Vos clients doivent\nencore 500 F CFA. '];
    expect(asMessage({ business: 'Pressing Afi', day: 'jeudi 8 octobre', lines })).toBe(
      'Pressing Afi — jeudi 8 octobre\nEncaissé aujourd’hui : 1 500 F CFA.\n  Vos clients doivent\nencore 500 F CFA. ',
    );
    const value = asOneValue(lines);
    expect(value).toBe('Encaissé aujourd’hui : 1 500 F CFA. — Vos clients doivent encore 500 F CFA.');
    expect(value).not.toMatch(/\n|\s{2,}/);
    expect(asOneValue(['a'.repeat(600), 'b'.repeat(600)]).length).toBe(1000);
  });
});

describe('the statement by e-mail', () => {
  it('carries the laundry, the day and each line, in the language that was chosen', async () => {
    const values = {
      business: 'Pressing Afi',
      day: 'jeudi 8 octobre',
      lines: ['Encaissé aujourd’hui : 48 500 F CFA.', 'Vos clients doivent encore 63 000 F CFA.'],
      language: 'fr' as const,
    };
    const mail = statementEmail.render(values, 'fr');
    expect(mail.subject).toBe('Pressing Afi — relevé du jeudi 8 octobre');
    const { html, text } = await renderEmail(mail.body);
    expect(html).toContain('lang="fr"');
    for (const line of values.lines) expect(text).toContain(line);
    expect(text).toContain('Pressing Afi');
    expect(statementEmail.render({ ...values, language: 'en' }, 'en').subject).toBe(
      'Pressing Afi — statement of jeudi 8 octobre',
    );
  });
});

interface DeliveryView {
  delivery: StatementDelivery;
  connected: { email: boolean; whatsapp: boolean; telegram: boolean };
  telegramLink: string | null;
}

describe('the evening statement, sent by itself', () => {
  let db: TestSchema;
  const afi = person('usr_afi', 'owner');
  const essi = person('usr_essi', 'member'); // cashier
  const sent: { channel: string; to: string; text?: string; template?: unknown }[] = [];
  const mails: { to: string; statement: StatementMail }[] = [];
  let refuse: ChannelError | null = null;
  const fakeChannel = (channel: 'whatsapp' | 'telegram'): CustomerChannel => ({
    channel,
    async sendText(to, text) {
      if (refuse) throw refuse;
      sent.push({ channel, to, text });
    },
    async sendTemplate(to, template) {
      if (refuse) throw refuse;
      sent.push({ channel, to, template });
    },
    async sendDocument() {},
  });
  const connected: Channels = { whatsapp: fakeChannel('whatsapp'), telegram: fakeChannel('telegram') };
  const ports = (over: Partial<SendingPorts> = {}): SendingPorts => ({
    channels: connected,
    mail: async (to, statement) => {
      mails.push({ to, statement });
    },
    whatsappTemplate: '',
    ...over,
  });
  const using = (next: SendingPorts) => useSendingPorts(async () => next);
  const view = () => done<DeliveryView>(afi, 'statement_delivery', {});
  const set = (input: Record<string, unknown>) =>
    act<{ enabled: boolean; hour: number; destinations: string[] }>(afi, 'statement_set_delivery', {
      enabled: true,
      hour: 20,
      language: 'fr',
      ...input,
    });
  const sendNow = () => done<{ outcome: SendingOutcome[] }>(afi, 'statement_send_now', {});
  const clear = () => {
    sent.length = 0;
    mails.length = 0;
    refuse = null;
  };

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'starting',
      staffing: 'solo',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    await hire(essi, 'cashier');
    using(ports());
  }, 180_000);

  afterAll(async () => {
    useSendingPorts(undefined);
    useChannels(undefined);
    await db.drop();
  });

  it('is off, at 20 h, to nowhere, until the laundry decides', async () => {
    const before = await view();
    expect(before.delivery).toEqual({
      enabled: false,
      hour: 20,
      language: 'fr',
      email: '',
      whatsapp: '',
      telegramLinked: false,
      lastSentOn: null,
      lastOutcome: [],
    });
    // No key, no bot, no number in the tests' environment: nothing is connected, and it is said.
    expect(before.connected).toEqual({ email: false, whatsapp: false, telegram: false });
    expect(before.telegramLink).toBeNull();
  });

  it('is the owner’s decision: a cashier neither reads nor sets it, an agent only prepares it', async () => {
    expect(await act(essi, 'statement_delivery', {})).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(essi, 'statement_set_delivery', { enabled: true, hour: 20, email: 'essi@example.test' })).toEqual({
      ok: false,
      code: 'not_allowed',
    });
    expect(await act(essi, 'statement_send_now', {})).toEqual({ ok: false, code: 'not_allowed' });
    for (const [name, input] of [
      ['statement_set_delivery', { enabled: true, hour: 20, email: 'ailleurs@example.test' }],
      ['statement_send_now', {}],
    ] as const) {
      const prepared = await asPerson(afi, () => registry.invoke({ ...agentFor(afi), name, input }));
      expect(prepared, name).toMatchObject({ status: 'draft' });
    }
    expect((await view()).delivery.email).toBe('');
  });

  it('refuses to be turned on with nowhere to go, and an address that is not one', async () => {
    expect(await set({})).toEqual({ ok: false, code: 'statement_no_destination' });
    expect(await act(afi, 'statement_send_now', {})).toEqual({ ok: false, code: 'statement_no_destination' });
    expect(await set({ email: 'pas-une-adresse' })).toMatchObject({ ok: false });
    expect(await set({ whatsapp: '12' })).toEqual({ ok: false, code: 'phone_invalid' });
  });

  it('keeps where it goes: an address, and a number with the laundry’s prefix', async () => {
    expect(await set({ email: 'afi@example.test', whatsapp: '90 12 34 56', hour: 19 })).toEqual({
      ok: true,
      output: { enabled: true, hour: 19, destinations: ['email', 'whatsapp'] },
    });
    expect((await view()).delivery).toMatchObject({
      enabled: true,
      hour: 19,
      email: 'afi@example.test',
      whatsapp: '+22890123456',
    });
  });

  it('sent now: the day’s statement leaves on each channel, with its figures', async () => {
    clear();
    const { outcome } = await sendNow();
    expect(outcome).toEqual([
      { channel: 'email', status: 'sent', reason: '' },
      { channel: 'whatsapp', status: 'sent', reason: '' },
    ]);
    expect(mails).toHaveLength(1);
    expect(mails[0]?.to).toBe('afi@example.test');
    expect(mails[0]?.statement).toMatchObject({ business: 'Pressing Afi', language: 'fr' });
    expect(mails[0]?.statement.lines[0]).toBe('Aucun dépôt ni encaissement aujourd’hui.');
    // The provider addresses a phone by its digits; the message opens with the laundry and the day.
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ channel: 'whatsapp', to: '22890123456' });
    expect(sent[0]?.text).toMatch(/^Pressing Afi — \S+ \d{1,2} \S+\nAucun dépôt ni encaissement aujourd’hui\./);
    // A check is not the evening's sending.
    expect((await view()).delivery.lastSentOn).toBeNull();
  });

  it('a channel that is not connected is said as such — nothing is simulated', async () => {
    clear();
    using(ports({ channels: { whatsapp: null, telegram: null }, mail: null }));
    expect((await sendNow()).outcome).toEqual([
      { channel: 'email', status: 'not_connected', reason: '' },
      { channel: 'whatsapp', status: 'not_connected', reason: '' },
    ]);
    expect(sent).toHaveLength(0);
    expect(mails).toHaveLength(0);
    using(ports());
  });

  it('a refusal keeps its reason; with the provider’s template, the statement is one value', async () => {
    clear();
    refuse = new ChannelError('outside_window');
    expect((await sendNow()).outcome[1]).toEqual({ channel: 'whatsapp', status: 'failed', reason: 'outside_window' });
    clear();
    using(ports({ whatsappTemplate: 'releve_du_soir' }));
    await sendNow();
    const template = sent[0]?.template as { name: string; language: string; parameters: string[] };
    expect(template.name).toBe('releve_du_soir');
    expect(template.language).toBe('fr');
    expect(template.parameters[0]).toBe('Pressing Afi');
    expect(template.parameters[2]).toContain('Aucun dépôt ni encaissement aujourd’hui.');
    for (const value of template.parameters) expect(value).not.toMatch(/\n|\s{2,}/);
    using(ports());
  });

  it('Telegram: the owner opens her link once, and her chat receives the statement', async () => {
    clear();
    useChannels(connected);
    process.env.TELEGRAM_BOT_TOKEN = '123:test';
    process.env.TELEGRAM_BOT_USERNAME = 'PressingAfiBot';
    process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret';
    const start = (text: string, chat: number) =>
      telegramWebhook(
        new Request('https://n.test/webhooks/telegram', {
          method: 'POST',
          headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' },
          body: JSON.stringify({
            message: { message_id: 1, from: { id: chat }, chat: { id: chat, type: 'private' }, text },
          }),
        }),
      );
    try {
      const { telegramLink } = await view();
      expect(telegramLink).toMatch(/^https:\/\/t\.me\/PressingAfiBot\?start=rel_[A-Za-z0-9_-]{20,}$/);
      // The same link while it was not opened.
      expect((await view()).telegramLink).toBe(telegramLink);
      const token = telegramLink?.split('start=')[1] ?? '';
      // A token nobody gave ties nothing, and says nothing.
      expect((await start('/start rel_unknownunknownunknown', 555)).status).toBe(200);
      expect(sent).toHaveLength(0);
      expect((await start(`/start ${token}`, 777)).status).toBe(200);
      expect(sent).toEqual([
        { channel: 'telegram', to: '777', text: expect.stringContaining('relevé du soir') },
      ]);
      const after = await view();
      expect(after.delivery.telegramLinked).toBe(true);
      expect(after.telegramLink).toBeNull();
      // The link works once: someone else who got hold of it ties nothing.
      clear();
      expect((await start(`/start ${token}`, 999)).status).toBe(200);
      expect(sent).toHaveLength(0);
      const { outcome } = await sendNow();
      expect(outcome.map((entry) => entry.channel)).toEqual(['email', 'whatsapp', 'telegram']);
      expect(sent.find((message) => message.channel === 'telegram')).toMatchObject({ to: '777' });
    } finally {
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_BOT_USERNAME;
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      useChannels(undefined);
    }
  });

  it('in the evening: found when its hour comes, sent once, and what it became is kept', async () => {
    clear();
    const lookup = getPool();
    const day = '2026-10-08';
    // Set for 19 h: not due at 18 h, due from 19 h on — and an identifier is all the job reads.
    expect(await organizationsDue(lookup, { hour: 18, day })).toEqual([]);
    expect(await organizationsDue(lookup, { hour: 19, day })).toEqual(['org_acme']);
    expect(await organizationsDue(lookup, { hour: 23, day })).toEqual(['org_acme']);
    const now = new Date(`${day}T19:05:00Z`);
    refuse = null;
    const first = await transaction('org_acme', (tx) => sendDueStatement(tx, ports(), now));
    expect(first?.map((entry) => `${entry.channel} ${entry.status}`)).toEqual([
      'email sent',
      'whatsapp sent',
      'telegram sent',
    ]);
    expect(mails).toHaveLength(1);
    // A second worker at the same minute sends nothing.
    expect(await transaction('org_acme', (tx) => sendDueStatement(tx, ports(), now))).toBeNull();
    expect(mails).toHaveLength(1);
    expect(await organizationsDue(lookup, { hour: 23, day })).toEqual([]);
    expect((await view()).delivery).toMatchObject({ lastSentOn: day, lastOutcome: first });
    // The next day, it is due again.
    expect(await organizationsDue(lookup, { hour: 19, day: '2026-10-09' })).toEqual(['org_acme']);
  });

  it('turned off, or its Telegram unlinked: it stops', async () => {
    expect(await set({ email: 'afi@example.test', whatsapp: '', unlinkTelegram: true })).toMatchObject({
      ok: true,
      output: { destinations: ['email'] },
    });
    expect((await view()).delivery.telegramLinked).toBe(false);
    expect(await set({ enabled: false, email: 'afi@example.test' })).toMatchObject({ ok: true });
    expect(await organizationsDue(getPool(), { hour: 23, day: '2026-10-09' })).toEqual([]);
  });

  it('one laundry’s destinations are never another’s', async () => {
    await assertOrganizationIsolation({
      app: db.app,
      table: 'statement_delivery',
      organizations: ['org_x', 'org_y'],
      insert: async (client, organizationId) => {
        await client.query(
          `insert into ${db.schema}.statement_delivery (organization_id, enabled, email)
           values ('${organizationId}', true, 'x@example.test')`,
        );
      },
    });
  }, 180_000);
});
