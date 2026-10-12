import { createHmac } from 'node:crypto';
import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { Customer } from '../src/features/customers';
import { deliver, hear, replyWords, type Message } from '../src/features/messaging';
import {
  checkTemplate,
  intentOf,
  mayRemind,
  renderTemplate,
  routeFor,
  sayDate,
  sayMoney,
  unknownPlaceholders,
} from '../src/features/messaging/domain/messages';
import { ChannelError, type Channels, type CustomerChannel } from '../src/features/messaging/ports';
import type { WorkUnit } from '../src/features/workshop';
import { useChannels } from '../src/platform/channels';
import { getPool, transaction } from '../src/platform/db';
import { telegramWebhook, whatsappWebhook } from '../src/platform/inbound';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// The messaging's proof (specs/006-messaging): nothing leaves unless the laundry decided it and
// the customer agreed; what leaves goes through WhatsApp or Telegram behind one port; every
// message keeps its reason. The adapters are the chassis' own (@kete/notify), proven there against
// recorded exchanges; here the webhooks are, from the signed request to the answer that leaves.

const values = {
  client: 'Mme Adjovi',
  numero: 'A-0412',
  contenu: '4 Chemise, 2 Pantalon',
  total: '5 400 F CFA',
  paye: '3 000 F CFA',
  reste: '2 400 F CFA',
  date: 'samedi 10 octobre à 17:00',
  pressing: 'Pressing Afi',
};

describe('the rules of a message', () => {
  it('fills the laundry’s words with the deposit’s values', () => {
    expect(renderTemplate('Bonjour {client}. Dépôt {numero} : reste {reste}. — {pressing}', values)).toBe(
      'Bonjour Mme Adjovi. Dépôt A-0412 : reste 2 400 F CFA. — Pressing Afi',
    );
  });

  it('refuses a value Nettio does not know, naming it', () => {
    expect(unknownPlaceholders('Bonjour {client}, votre {remise} et {prix}')).toEqual(['remise', 'prix']);
    expect(() => checkTemplate('Bonjour {client}')).not.toThrow();
    expect(() => checkTemplate('Bonjour {prenom}')).toThrow(/template_unknown_placeholder/);
    expect(() => checkTemplate('   ')).toThrow(/template_empty/);
  });

  it('says money and dates as a message does', () => {
    expect(sayMoney(1103000)).toBe('1 103 000 F CFA');
    expect(sayDate(new Date('2026-10-10T17:00:00Z'))).toBe('samedi 10 octobre à 17:00');
  });

  it('finds where a message goes — or why it does not leave', () => {
    const customer = { phone: '+22890123456', channel: 'whatsapp' as const, consent: true, telegramChatId: null };
    expect(routeFor(customer)).toEqual({ send: true, channel: 'whatsapp', to: '22890123456' });
    expect(routeFor({ ...customer, consent: false })).toEqual({ send: false, reason: 'no_consent' });
    expect(routeFor({ ...customer, channel: 'none' })).toEqual({ send: false, reason: 'no_channel' });
    expect(routeFor({ ...customer, channel: 'sms' })).toEqual({ send: false, reason: 'sms_not_connected' });
    expect(routeFor({ ...customer, channel: 'telegram' })).toEqual({
      send: false,
      reason: 'telegram_not_linked',
    });
    expect(routeFor({ ...customer, channel: 'telegram', telegramChatId: '4242' })).toEqual({
      send: true,
      channel: 'telegram',
      to: '4242',
    });
  });

  it('hears what a customer wants', () => {
    expect(intentOf('STOP')).toEqual({ kind: 'stop' });
    expect(intentOf(' arrêtez svp')).toEqual({ kind: 'stop' });
    expect(intentOf('/start AbC_123-xyz9')).toEqual({ kind: 'link', token: 'AbC_123-xyz9' });
    expect(intentOf('Où en est ma commande ?')).toEqual({ kind: 'status' });
    expect(intentOf('/start')).toEqual({ kind: 'status' });
  });

  it('a reminder leaves for a deposit that sleeps, at most once in the delay', () => {
    const now = new Date('2026-10-31T10:00:00Z');
    const base = { now, dormantDays: 30, reminderDays: 7, lastRemindedAt: null };
    expect(mayRemind({ ...base, readyAt: new Date('2026-10-20T10:00:00Z') })).toBe(false);
    expect(mayRemind({ ...base, readyAt: new Date('2026-09-30T10:00:00Z') })).toBe(true);
    const old = new Date('2026-09-01T10:00:00Z');
    expect(mayRemind({ ...base, readyAt: old, lastRemindedAt: new Date('2026-10-28T10:00:00Z') })).toBe(false);
    expect(mayRemind({ ...base, readyAt: old, lastRemindedAt: new Date('2026-10-24T10:00:00Z') })).toBe(true);
  });
});

describe('the messages of a laundry', () => {
  let db: TestSchema;
  let site: Site;
  let read: Catalog;
  const afi = person('usr_afi', 'owner');
  const mawuli = person('usr_mawuli', 'member'); // counter
  const sent: { channel: string; to: string; text?: string; template?: unknown }[] = [];
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
  const messages = (orderId?: string) =>
    done<Message[]>(afi, 'messages_list', orderId ? { orderId } : {});
  const deliverNow = (channels: Channels) => transaction('org_acme', (tx) => deliver(tx, channels));
  const shirt = (quantity: number) => ({
    serviceId: read.services.find((s) => s.name === 'Lavage et repassage')?.serviceId,
    articleId: read.articles.find((a) => a.name === 'Chemise')?.articleId,
    quantity,
  });
  const receive = (phone: string, name: string, extra: object = {}) =>
    done<{ orderId: string; number: string }>(afi, 'orders_receive', {
      siteId: site.siteId,
      phone,
      customerName: name,
      lines: [shirt(4)],
      ...extra,
    });
  const template = (kind: string, body: string, extra: object = {}) =>
    done(afi, 'messages_set_template', { kind, enabled: true, body, ...extra });

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'starting',
      staffing: 'solo',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    site = (await done<{ sites: Site[] }>(afi, 'business_overview', {})).sites[0] as Site;
    read = await done<Catalog>(afi, 'catalog_read', {});
    const wash = read.services.find((s) => s.name === 'Lavage et repassage');
    // One workshop step: the last touch makes the deposit ready.
    await done(afi, 'catalog_save_service', {
      ...wash,
      stepIds: [read.steps.find((s) => s.name === 'Lavage')?.stepId],
    });
    await done(afi, 'catalog_set_price', { ...shirt(1), quantity: undefined, amount: 500 });
    await hire(mawuli, 'counter');
  }, 180_000);

  afterAll(async () => {
    useChannels(undefined);
    await db.drop();
  });

  it('nothing leaves while the laundry has not turned a kind on', async () => {
    await receive('90 12 34 56', 'Mme Adjovi');
    expect(await messages()).toHaveLength(0);
    const settings = await done<{ templates: { kind: string; enabled: boolean }[]; channels: object }>(
      afi,
      'messages_settings',
      {},
    );
    expect(settings.templates.map((t) => [t.kind, t.enabled])).toEqual([
      ['receipt', false],
      ['ready', false],
      ['reminder', false],
    ]);
    expect(settings.channels).toEqual({ whatsapp: false, telegram: false });
  });

  it('the words are the laundry’s: decided by who may, refused when they name the unknown', async () => {
    const input = { kind: 'receipt', enabled: true, body: 'Bonjour {client}' };
    expect(await act(mawuli, 'messages_set_template', input)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(afi, 'messages_set_template', { ...input, body: 'Bonjour {prenom}' })).toEqual({
      ok: false,
      code: 'template_unknown_placeholder',
    });
    const prepared = await asPerson(afi, () =>
      registry.invoke({ ...agentFor(afi), name: 'messages_set_template', input }),
    );
    expect(prepared).toMatchObject({ status: 'draft' });
    await template(
      'receipt',
      'Bonjour {client}. Dépôt {numero} reçu : {contenu}. Total {total}, payé {paye}, reste {reste}. — {pressing}',
    );
    await template('ready', 'Bonjour {client}. Votre dépôt {numero} est prêt. Reste à payer : {reste}. — {pressing}');
  });

  let deposit: { orderId: string; number: string };

  it('a received deposit queues its receipt, with figures computed by code', async () => {
    deposit = await receive('90 12 34 56', 'Mme Adjovi', { payment: { amount: 500, method: 'mobile_money' } });
    const [message] = await messages(deposit.orderId);
    expect(message).toMatchObject({
      kind: 'receipt',
      channel: 'whatsapp',
      status: 'queued',
      customerName: 'Mme Adjovi',
      body: `Bonjour Mme Adjovi. Dépôt ${deposit.number} reçu : 4 Chemise. Total 2 000 F CFA, payé 500 F CFA, reste 1 500 F CFA. — Pressing Afi`,
    });
  });

  it('a channel that is not connected leaves its messages waiting: nothing is simulated', async () => {
    expect(await deliverNow({ whatsapp: null, telegram: null })).toEqual({ sent: 0, failed: 0, waiting: 1 });
    expect((await messages(deposit.orderId))[0]?.status).toBe('queued');
  });

  it('a refusal keeps its reason, and the message can be sent again', async () => {
    refuse = new ChannelError('outside_window');
    expect(await deliverNow(connected)).toEqual({ sent: 0, failed: 1, waiting: 0 });
    const [failed] = await messages(deposit.orderId);
    expect(failed).toMatchObject({ status: 'failed', reason: 'outside_window' });
    refuse = null;
    await done(afi, 'messages_resend', { messageId: failed?.messageId });
    expect(await deliverNow(connected)).toEqual({ sent: 1, failed: 0, waiting: 0 });
    expect((await messages(deposit.orderId))[0]).toMatchObject({ status: 'sent', reason: '' });
    expect(sent.at(-1)).toMatchObject({ channel: 'whatsapp', to: '22890123456' });
    expect(sent.at(-1)?.text).toContain(`Dépôt ${deposit.number} reçu`);
  });

  it('the last workshop step makes the deposit ready, and tells its customer once', async () => {
    const { units } = await done<{ units: WorkUnit[] }>(afi, 'workshop_order', { orderId: deposit.orderId });
    await done(afi, 'workshop_advance', { unitId: units[0]?.unitId });
    const list = await messages(deposit.orderId);
    expect(list.map((m) => m.kind)).toEqual(['ready', 'receipt']);
    expect(list[0]?.body).toBe(
      `Bonjour Mme Adjovi. Votre dépôt ${deposit.number} est prêt. Reste à payer : 1 500 F CFA. — Pressing Afi`,
    );
    await deliverNow(connected);
  });

  it('with an approved template, the message leaves as that template, its values in order', async () => {
    await template('receipt', 'Bonjour {client}. Dépôt {numero} reçu. — {pressing}', {
      providerTemplate: 'depot_recu',
    });
    const other = await receive('90 12 34 56', 'Mme Adjovi');
    await deliverNow(connected);
    expect(sent.at(-1)).toMatchObject({
      channel: 'whatsapp',
      to: '22890123456',
      template: { name: 'depot_recu', language: 'fr' },
    });
    const parameters = (sent.at(-1)?.template as { parameters: string[] }).parameters;
    expect(parameters.slice(0, 2)).toEqual(['Mme Adjovi', other.number]);
    expect(parameters).toHaveLength(8);
    await template('receipt', 'Bonjour {client}. Dépôt {numero} reçu. — {pressing}');
  });

  it('a customer who cannot be reached gets a row that says why; nothing leaves', async () => {
    const quiet = await receive('91 11 11 11', 'M. Kpodar');
    const [customer] = await done<Customer[]>(afi, 'customers_search', { text: 'Kpodar' });
    const before = sent.length;
    await done(afi, 'customers_save', { ...customer, channel: 'telegram' });
    const viaTelegram = await receive('91 11 11 11', 'M. Kpodar');
    await done(afi, 'customers_save', { ...customer, channel: 'none' });
    const none = await receive('91 11 11 11', 'M. Kpodar');
    await deliverNow(connected);
    expect((await messages(quiet.orderId))[0]).toMatchObject({ status: 'sent' });
    expect((await messages(viaTelegram.orderId))[0]).toMatchObject({
      status: 'skipped',
      reason: 'telegram_not_linked',
      channel: 'none',
    });
    expect((await messages(none.orderId))[0]).toMatchObject({ status: 'skipped', reason: 'no_channel' });
    expect(sent.length).toBe(before + 1);
    await done(afi, 'customers_save', { ...customer, channel: 'telegram' });
  });

  it('a customer opens the Telegram link of her receipt: her chat is linked', async () => {
    process.env.TELEGRAM_BOT_TOKEN = '123:test';
    process.env.TELEGRAM_BOT_USERNAME = 'PressingAfiBot';
    try {
      const [customer] = await done<Customer[]>(afi, 'customers_search', { text: 'Kpodar' });
      const { link } = await done<{ link: string }>(afi, 'messages_telegram_link', {
        customerId: customer?.customerId,
      });
      expect(link).toMatch(/^https:\/\/t\.me\/PressingAfiBot\?start=[A-Za-z0-9_-]{16}$/);
      const token = link.split('start=')[1] ?? '';
      const deps = { lookup: getPool(), inOrganization: transaction, words: replyWords() };
      // The link only ties a Telegram chat; an unknown token ties nothing.
      expect(await hear({ channel: 'telegram', sender: '4242', text: '/start unknown_token_0' }, deps)).toEqual([]);
      expect(await hear({ channel: 'telegram', sender: '4242', text: `/start ${token}` }, deps)).toEqual([
        'org_acme',
      ]);
      await deliverNow(connected);
      expect(sent.at(-1)).toMatchObject({ channel: 'telegram', to: '4242' });
      expect(sent.at(-1)?.text).toContain('Pressing Afi vous écrira ici');
      const next = await receive('91 11 11 11', 'M. Kpodar');
      expect((await messages(next.orderId))[0]).toMatchObject({ channel: 'telegram', status: 'queued' });
      await deliverNow(connected);
      expect(sent.at(-1)).toMatchObject({ channel: 'telegram', to: '4242' });
    } finally {
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_BOT_USERNAME;
    }
  });

  it('« où en est ma commande ? » is answered with her deposits, computed', async () => {
    useChannels(connected);
    process.env.WHATSAPP_APP_SECRET = 'app-secret';
    try {
      const body = JSON.stringify({
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    { from: '22890123456', id: 'wamid.9', type: 'text', text: { body: 'Où en est ma commande ?' } },
                  ],
                },
              },
            ],
          },
        ],
      });
      const signed = (signature: string) =>
        whatsappWebhook(
          new Request('https://n.test/webhooks/whatsapp', {
            method: 'POST',
            headers: { 'x-hub-signature-256': signature },
            body,
          }),
        );
      const before = sent.length;
      // Not signed by Meta: nothing is read.
      expect((await signed('sha256=00')).status).toBe(401);
      expect(sent.length).toBe(before);
      const signature = `sha256=${createHmac('sha256', 'app-secret').update(body).digest('hex')}`;
      expect((await signed(signature)).status).toBe(200);
      const answer = sent.at(-1);
      expect(answer).toMatchObject({ channel: 'whatsapp', to: '22890123456' });
      expect(answer?.text).toContain(`Dépôt ${deposit.number} : prêt. Reste à payer : 1 500 F CFA.`);
      expect(answer?.text).toMatch(/Dépôt A-\d{4} : en cours, promis pour /);
      expect(answer?.text).toContain('— Pressing Afi');
      // What she wrote and what was answered are kept.
      const kinds = (await messages()).slice(0, 2).map((m) => [m.kind, m.status]);
      expect(kinds).toEqual(
        expect.arrayContaining([
          ['reply', 'sent'],
          ['inbound', 'received'],
        ]),
      );
    } finally {
      delete process.env.WHATSAPP_APP_SECRET;
    }
  });

  it('an unknown sender gets no answer; a wrong Telegram secret reads nothing', async () => {
    const deps = { lookup: getPool(), inOrganization: transaction, words: replyWords() };
    expect(await hear({ channel: 'whatsapp', sender: '22899999999', text: 'Bonjour' }, deps)).toEqual([]);
    process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret';
    try {
      const call = (secret: string) =>
        telegramWebhook(
          new Request('https://n.test/webhooks/telegram', {
            method: 'POST',
            headers: { 'x-telegram-bot-api-secret-token': secret, 'content-type': 'application/json' },
            body: JSON.stringify({
              message: { message_id: 1, from: { id: 777 }, chat: { id: 777, type: 'private' }, text: 'Bonjour' },
            }),
          }),
        );
      expect((await call('wrong')).status).toBe(401);
      expect((await call('s3cret')).status).toBe(200);
    } finally {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
    }
  });

  it('« stop » withdraws her consent: nothing leaves for her any more', async () => {
    const deps = { lookup: getPool(), inOrganization: transaction, words: replyWords() };
    expect(await hear({ channel: 'whatsapp', sender: '22890123456', text: 'STOP' }, deps)).toEqual(['org_acme']);
    await deliverNow(connected);
    expect(sent.at(-1)?.text).toBe('C’est noté : vous ne recevrez plus de messages de Pressing Afi.');
    const [customer] = await done<Customer[]>(afi, 'customers_search', { text: 'Adjovi' });
    expect(customer?.consent).toBe(false);
    const after = await receive('90 12 34 56', 'Mme Adjovi');
    expect((await messages(after.orderId))[0]).toMatchObject({ status: 'skipped', reason: 'no_consent' });
    await done(afi, 'customers_save', { ...customer, consent: true });
  });

  it('chases what sleeps on the laundry’s decision, at most once in the delay', async () => {
    expect(await act(afi, 'messages_remind', {})).toEqual({ ok: false, code: 'reminder_not_enabled' });
    await template('reminder', 'Bonjour {client}. Votre dépôt {numero} vous attend. — {pressing}');
    // Ready today: it does not sleep yet.
    expect(await done(afi, 'messages_remind', {})).toEqual({ queued: 0, notSent: 0 });
    await db.owner.query(
      `update ${db.schema}.orders set ready_at = now() - interval '45 days' where order_id = $1`,
      [deposit.orderId],
    );
    expect(await done(afi, 'messages_remind', {})).toEqual({ queued: 1, notSent: 0 });
    expect((await messages(deposit.orderId))[0]).toMatchObject({ kind: 'reminder', status: 'queued' });
    expect(await done(afi, 'messages_remind', {})).toEqual({ queued: 0, notSent: 0 });
  });

  it('across organizations, a sender’s lookup answers with identifiers only', async () => {
    const { rows, fields } = await db.app.query(
      `select * from ${db.schema}.messaging_customers_by_phone('+22890123456')`,
    );
    expect(fields.map((field) => field.name)).toEqual(['organization_id', 'customer_id']);
    expect(rows).toHaveLength(1);
    // Without the function, the application role sees no customer outside an organization.
    expect((await db.app.query(`select 1 from ${db.schema}.customers`)).rows).toHaveLength(0);
  });

  it('keeps each organization’s templates and messages to itself (RLS)', async () => {
    const chain: Record<string, (org: string) => string[]> = {
      message_templates: (org) => [
        `insert into message_templates (organization_id, kind, enabled, body)
         values ('${org}', 'receipt', true, 'x')`,
      ],
      messages: (org) => [
        `insert into customers (customer_id, organization_id, phone, name)
         values ('cus_msg_${org}', '${org}', '+22893000001', 'x')`,
        `insert into messages (message_id, organization_id, customer_id, kind, channel, body, status)
         values ('msg_${org}', '${org}', 'cus_msg_${org}', 'receipt', 'whatsapp', 'x', 'queued')`,
      ],
    };
    for (const table of Object.keys(chain)) {
      await assertOrganizationIsolation({
        app: db.app,
        table,
        organizations: ['org_x', 'org_y'],
        insert: async (client, organizationId) => {
          for (const sql of chain[table]?.(organizationId) ?? []) await client.query(sql);
        },
      });
    }
  }, 180_000);
});
