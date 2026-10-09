import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { MockLanguageModelV4 } from 'ai/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { heardFromStaff } from '../src/features/assistant';
import type { MessagingView } from '../src/features/assistant/functions';
import type { Channels, CustomerChannel } from '../src/features/messaging/ports';
import { useModel } from '../src/platform/ai';
import { useChannels } from '../src/platform/channels';
import { getPool, transaction } from '../src/platform/db';
import { telegramWebhook } from '../src/platform/inbound';
import { asStaff } from '../src/platform/rights';
import { act, done, freshSchema, hire, person } from './helpers';

// Asking Nettio from one's own WhatsApp or Telegram (specs/023-ask-by-messaging): a person of the
// team ties her messaging with a token only she was shown, then asks with her own rights — and
// by message Nettio only reads. The channels are recorded fakes, the model is scripted.

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: 0 },
};

/** A model that opens one reading, then says what it was told to say. */
function scripted(tool: string, answer: string) {
  let step = 0;
  return new MockLanguageModelV4({
    provider: 'scripted',
    modelId: 'scripted-1',
    doGenerate: async () => {
      step += 1;
      return step % 2 === 1
        ? {
            content: [{ type: 'tool-call', toolCallId: `call_${step}`, toolName: tool, input: '{}' }],
            finishReason: { unified: 'tool-calls', raw: undefined },
            usage,
            warnings: [],
          }
        : {
            content: [{ type: 'text', text: answer }],
            finishReason: { unified: 'stop', raw: undefined },
            usage,
            warnings: [],
          };
    },
  });
}

const offered = (model: MockLanguageModelV4, call = 0): string[] =>
  (model.doGenerateCalls[call]?.tools ?? []).map((tool) => tool.name).sort();

describe('asking Nettio by message', () => {
  let db: TestSchema;
  const afi = person('usr_afi', 'owner');
  const essi = person('usr_essi', 'member'); // cashier
  const sent: { channel: string; to: string; text: string }[] = [];
  const fakeChannel = (channel: 'whatsapp' | 'telegram'): CustomerChannel => ({
    channel,
    async sendText(to, text) {
      sent.push({ channel, to, text });
    },
    async sendDocument() {},
  });
  const connected: Channels = { whatsapp: fakeChannel('whatsapp'), telegram: fakeChannel('telegram') };
  const telegram = (chat: number, text: string) =>
    telegramWebhook(
      new Request('https://n.test/webhooks/telegram', {
        method: 'POST',
        headers: { 'x-telegram-bot-api-secret-token': 's3cret', 'content-type': 'application/json' },
        body: JSON.stringify({
          message: { message_id: 1, from: { id: chat }, chat: { id: chat, type: 'private' }, text },
        }),
      }),
    );
  const link = (who: typeof afi) => done<MessagingView>(who, 'assistant_messaging', {});

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'starting',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    await hire(afi, 'owner');
    await hire(essi, 'cashier');
    useChannels(connected);
    process.env.TELEGRAM_BOT_TOKEN = '123:test';
    process.env.TELEGRAM_BOT_USERNAME = 'PressingAfiBot';
    process.env.TELEGRAM_WEBHOOK_SECRET = 's3cret';
  }, 180_000);

  afterAll(async () => {
    useModel(undefined);
    useChannels(undefined);
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_BOT_USERNAME;
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    await db.drop();
  });

  it('a person is shown her own token, and a link to her Telegram', async () => {
    const mine = await link(afi);
    expect(mine.link).toEqual({ telegram: false, whatsapp: false });
    expect(mine.token).toMatch(/^ask_[A-Za-z0-9_-]{20,}$/);
    expect(mine.telegramLink).toBe(`https://t.me/PressingAfiBot?start=${mine.token}`);
    expect(mine.connected).toEqual({ whatsapp: true, telegram: true });
    // The same token until she unties; another person has another one.
    expect((await link(afi)).token).toBe(mine.token);
    expect((await link(essi)).token).not.toBe(mine.token);
  });

  it('sending her token ties the chat it came from; a token nobody was shown ties nothing', async () => {
    sent.length = 0;
    expect((await telegram(555, '/start ask_unknownunknownunknown')).status).toBe(200);
    expect(sent).toEqual([]);
    const { token } = await link(afi);
    expect((await telegram(777, `/start ${token}`)).status).toBe(200);
    expect(sent).toEqual([{ channel: 'telegram', to: '777', text: expect.stringContaining('posez vos questions ici') }]);
    expect((await link(afi)).link).toEqual({ telegram: true, whatsapp: false });
  });

  it('her question is answered with her rights — and by message, Nettio only reads', async () => {
    sent.length = 0;
    const model = scripted('money_result', 'Ce mois-ci, votre résultat est de 0 F CFA (Résultat du mois).');
    useModel(model);
    await telegram(777, 'Combien j’ai gagné ce mois-ci ?');
    expect(sent).toEqual([
      { channel: 'telegram', to: '777', text: 'Ce mois-ci, votre résultat est de 0 F CFA (Résultat du mois).' },
    ]);
    const tools = offered(model);
    expect(tools).toEqual(expect.arrayContaining(['money_result', 'day_statement', 'orders_today', 'alerts_read']));
    // Nothing that changes anything: a gesture could not be confirmed by message.
    for (const name of ['payments_record', 'expenses_record', 'orders_cancel', 'invoices_issue', 'catalog_set_price']) {
      expect(tools, name).not.toContain(name);
    }
  });

  it('a cashier who ties her chat cannot reach what she cannot open in the app', async () => {
    sent.length = 0;
    const { token } = await link(essi);
    await telegram(888, `/start ${token}`);
    const model = scripted('orders_today', 'Aujourd’hui : aucun dépôt.');
    useModel(model);
    await telegram(888, 'Combien le pressing a gagné ?');
    expect(sent.at(-1)).toEqual({ channel: 'telegram', to: '888', text: 'Aujourd’hui : aucun dépôt.' });
    const tools = offered(model);
    expect(tools).toContain('orders_today');
    for (const name of ['money_result', 'costs_read', 'day_statement', 'team_work']) {
      expect(tools, name).not.toContain(name);
    }
  });

  it('a stranger is nobody of the team: her message is a customer’s, and Nettio stays silent', async () => {
    sent.length = 0;
    const model = scripted('orders_today', 'ne doit pas partir');
    useModel(model);
    await telegram(999, 'Combien le pressing a gagné ?');
    expect(sent).toEqual([]);
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('WhatsApp ties by the same token, sent as it is from her phone', async () => {
    const replies: string[] = [];
    const ports = {
      lookup: getPool(),
      inOrganization: transaction,
      asStaff,
      reply: async (text: string) => {
        replies.push(text);
      },
      words: {
        tied: () => 'relié',
        untied: () => 'délié',
        notConnected: () => 'pas branché',
        budgetSpent: () => 'budget atteint',
        notAllowed: () => 'pas le droit',
      },
    };
    const { token } = await link(afi);
    expect(await heardFromStaff({ channel: 'whatsapp', sender: '22890123456', text: token }, ports)).toBe(true);
    expect(replies).toEqual(['relié']);
    expect((await link(afi)).link).toEqual({ telegram: true, whatsapp: true });
    useModel(scripted('orders_today', 'Aucun dépôt aujourd’hui.'));
    expect(await heardFromStaff({ channel: 'whatsapp', sender: '22890123456', text: 'Où en est ma journée ?' }, ports)).toBe(true);
    expect(replies.at(-1)).toBe('Aucun dépôt aujourd’hui.');
    // Without a model, she is told so — nothing is simulated.
    useModel(null);
    await heardFromStaff({ channel: 'whatsapp', sender: '22890123456', text: 'Et le mois ?' }, ports);
    expect(replies.at(-1)).toBe('pas branché');
    // Another phone is nobody.
    expect(await heardFromStaff({ channel: 'whatsapp', sender: '22899999999', text: 'Bonjour' }, ports)).toBe(false);
  });

  it('« stop » unties her messaging; so does the gesture in the app', async () => {
    sent.length = 0;
    await telegram(777, 'stop');
    expect(sent).toEqual([{ channel: 'telegram', to: '777', text: expect.stringContaining('délié') }]);
    expect((await link(afi)).link).toEqual({ telegram: false, whatsapp: false });
    // Her token changed: the old link no longer ties anything.
    sent.length = 0;
    useModel(scripted('orders_today', 'ne doit pas partir'));
    await telegram(777, 'Où en est ma journée ?');
    expect(sent).toEqual([]);
    await done(essi, 'assistant_untie_messaging', {});
    expect((await link(essi)).link).toEqual({ telegram: false, whatsapp: false });
  });

  it('who left the team, or holds no role, holds nothing by message', async () => {
    const nobody = person('usr_nobody', 'member');
    expect(await asStaff({ organizationId: 'org_acme', userId: nobody.userId }, async () => 'answered')).toBeNull();
    await hire(nobody, null);
    expect(await asStaff({ organizationId: 'org_acme', userId: nobody.userId }, async () => 'answered')).toBeNull();
    // And who may not ask at all is refused the link itself.
    expect(await act(nobody, 'assistant_messaging', {})).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('one laundry’s messaging links are never another’s', async () => {
    await assertOrganizationIsolation({
      app: db.app,
      table: 'staff_messaging',
      organizations: ['org_x', 'org_y'],
      insert: async (client, organizationId) => {
        await client.query(
          `insert into ${db.schema}.staff_messaging (organization_id, user_id, telegram_chat_id)
           values ('${organizationId}', 'usr_${organizationId}', 'chat_${organizationId}')`,
        );
      },
    });
  }, 180_000);
});
