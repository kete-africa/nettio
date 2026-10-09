import { postgresBudgetStore } from '@kete/ai';
import { validateManifest } from '@kete/sdk';
import type { TestSchema } from '@kete/testing';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  askNettio,
  ASSISTANT,
  converse,
  dayStatement,
  SYSTEM,
  type AssistantEvent,
  type StatementFacts,
} from '../src/features/assistant';
import { statementWords } from '../src/features/assistant/statement-words';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { CashSession } from '../src/features/money';
import { useModel } from '../src/platform/ai';
import { manifest } from '../src/platform/events';
import { asPerson } from '../src/platform/rights';
import { act, connect, done, freshSchema, hire, person } from './helpers';

// Kete Intelligence's proof (specs/007-intelligence): the day's statement is computed by code and
// worded with fixed sentences; « Demander » offers a model only the readings the person may open,
// and nothing that changes anything. A scripted model proves the wiring, the rights and the
// limits — not the quality of an answer.

const facts: StatementFacts = {
  cashed: 48_500,
  received: 14,
  pieces: 61,
  ready: 9,
  dormant: 2,
  late: 3,
  outstanding: 63_000,
  belowCost: 1,
  openTills: 1,
  closedTills: [
    { cashier: 'Essi', gap: -500 },
    { cashier: 'Kossi', gap: 0 },
  ],
  openIncidents: 1,
  month: { cashed: 1_103_000, charges: 848_500, result: 254_500, draws: 70_000, left: 184_500 },
};

describe('the day’s statement, a pure function', () => {
  it('says the day, what needs a look, then the month — with fixed words', () => {
    expect(dayStatement(facts, statementWords('fr'))).toEqual([
      'Encaissé aujourd’hui : 48 500 F CFA, pour 14 dépôt(s) reçu(s) et 61 pièce(s).',
      '9 dépôt(s) prêt(s) attendent leur client.',
      '3 dépôt(s) ont dépassé leur date promise.',
      '2 dépôt(s) prêt(s) dorment depuis plus longtemps que votre délai.',
      'Vos clients doivent encore 63 000 F CFA.',
      '1 dépôt(s) de ce mois sont partis sous leur coût variable.',
      'Caisse de Essi : clôturée avec un écart de − 500 F CFA.',
      'Caisse de Kossi : clôturée, elle tombe juste.',
      '1 caisse(s) encore ouverte(s), non comptée(s).',
      '1 incident(s) d’atelier encore ouvert(s).',
      'Ce mois-ci : 1 103 000 F CFA encaissés, 848 500 F CFA de charges, résultat + 254 500 F CFA.',
      'Vous avez pris 70 000 F CFA : il reste + 184 500 F CFA.',
    ]);
  });

  it('a day with nothing says so, and keeps quiet about what is fine', () => {
    const quiet: StatementFacts = {
      ...facts,
      cashed: 0,
      received: 0,
      pieces: 0,
      ready: 0,
      dormant: 0,
      late: 0,
      outstanding: 0,
      belowCost: 0,
      openTills: 0,
      closedTills: [],
      openIncidents: 0,
      month: { cashed: 0, charges: 0, result: 0, draws: 0, left: 0 },
    };
    expect(dayStatement(quiet, statementWords('en'))).toEqual([
      'No deposit nor payment today.',
      'This month: 0 F CFA cashed, 0 F CFA of charges, result + 0 F CFA.',
    ]);
  });
});

const usage = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: 0 },
};

/** A model that calls one tool, then answers with what it was told to say. */
function scripted(tool: string, answer: string, input: Record<string, unknown> = {}) {
  let step = 0;
  return new MockLanguageModelV4({
    provider: 'scripted',
    modelId: 'scripted-1',
    doGenerate: async () => {
      step += 1;
      return step === 1
        ? {
            content: [{ type: 'tool-call', toolCallId: 'call_1', toolName: tool, input: JSON.stringify(input) }],
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

const offered = (model: MockLanguageModelV4): string[] =>
  (model.doGenerateCalls[0]?.tools ?? []).map((tool) => tool.name).sort();

describe('asking Nettio', () => {
  let db: TestSchema;
  let site: Site;
  const afi = person('usr_afi', 'owner');
  const essi = person('usr_essi', 'member'); // cashier
  const me = (identity: typeof afi) => ({ userId: identity.userId, organizationId: 'org_acme' });

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
    const read = await done<Catalog>(afi, 'catalog_read', {});
    const wash = read.services.find((s) => s.name === 'Lavage et repassage');
    const shirt = read.articles.find((a) => a.name === 'Chemise');
    await done(afi, 'catalog_set_price', {
      serviceId: wash?.serviceId,
      articleId: shirt?.articleId,
      amount: 500,
    });
    await done(afi, 'cash_open', { siteId: site.siteId, openingFloat: 5_000 });
    await done(afi, 'orders_receive', {
      siteId: site.siteId,
      phone: '90 12 34 56',
      customerName: 'Mme Adjovi',
      lines: [{ serviceId: wash?.serviceId, articleId: shirt?.articleId, quantity: 4 }],
      payment: { amount: 1_500, method: 'cash' },
    });
    await done(afi, 'expenses_record', {
      spentOn: new Date().toISOString().slice(0, 10),
      label: 'Loyer',
      category: 'rent',
      behavior: 'fixed',
      amount: 1_000,
      paidFrom: 'bank',
    });
    const [till] = await done<CashSession[]>(afi, 'cash_sessions', {});
    await done(afi, 'cash_close', { sessionId: till?.sessionId, counted: 6_000 });
    await hire(essi, 'cashier');
  }, 180_000);

  afterAll(async () => {
    useModel(undefined);
    await db.drop();
  });

  it('the statement of a real day: its figures, its till and its gap', async () => {
    const statement = await done<{ lines: string[]; business: string }>(afi, 'day_statement', {});
    expect(statement.business).toBe('Pressing Afi');
    expect(statement.lines).toEqual([
      'Encaissé aujourd’hui : 1 500 F CFA, pour 1 dépôt(s) reçu(s) et 4 pièce(s).',
      'Vos clients doivent encore 500 F CFA.',
      'Caisse de usr_afi : clôturée avec un écart de − 500 F CFA.',
      'Ce mois-ci : 1 500 F CFA encaissés, 1 000 F CFA de charges, résultat + 500 F CFA.',
    ]);
    // Who may not read the money does not read the statement.
    expect(await act(essi, 'day_statement', {})).toEqual({ ok: false, code: 'not_allowed' });
  });

  it('a copilot the owner signed in with reads the same statement', async () => {
    const client = await connect(afi);
    const read = await client.callTool({ name: 'day_statement', arguments: { language: 'en' } });
    const output = (read.structuredContent as { output?: { lines: string[] }; lines?: string[] }) ?? {};
    const lines = output.output?.lines ?? output.lines ?? [];
    expect(lines[0]).toBe('Cashed today: 1,500 F CFA, for 1 deposit(s) received and 4 piece(s).');
    await client.close();
  });

  it('without a model, « Demander » says it is not connected', async () => {
    useModel(null);
    expect(await asPerson(afi, () => askNettio(me(afi), 'Combien j’ai gagné ?'))).toEqual({
      available: false,
      reason: 'not_connected',
    });
  });

  it('the model reaches the readings the person may open — and answers with their figures', async () => {
    const model = scripted('money_result', 'Ce mois-ci, votre résultat est de 500 F CFA (Résultat du mois).');
    useModel(model);
    const outcome = await asPerson(afi, () => askNettio(me(afi), 'Combien j’ai gagné ce mois-ci ?', '/aujourdhui'));
    expect(outcome).toEqual({
      available: true,
      answer: 'Ce mois-ci, votre résultat est de 500 F CFA (Résultat du mois).',
      sources: ['money_result'],
      prepared: [],
    });
    // The reading really ran, under her rights, and its result went back to the model.
    const second = JSON.stringify(model.doGenerateCalls[1]?.prompt);
    expect(second).toContain('"result":500');
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain(SYSTEM.slice(0, 40));
    expect(JSON.stringify(model.doGenerateCalls[0]?.prompt)).toContain('[Screen open: /aujourdhui]');
  });

  it('a gesture asked for is prepared, never done: a draft waits for the person', async () => {
    const expense = {
      spentOn: new Date().toISOString().slice(0, 10),
      label: 'Lessive (assistant)',
      category: 'detergent',
      behavior: 'variable',
      amount: 3_500,
      paidFrom: 'bank',
    };
    const model = scripted('expenses_record', 'J’ai préparé la dépense : vérifiez et confirmez.', expense);
    useModel(model);
    const outcome = await asPerson(afi, () => askNettio(me(afi), 'Note 3 500 de lessive payée par la banque'));
    expect(outcome).toMatchObject({
      available: true,
      sources: [],
      prepared: [{ name: 'expenses_record', draftId: expect.any(String) }],
    });
    // Nothing was recorded: the expense exists only as a draft.
    const { expenses } = await done<{ expenses: { label: string }[] }>(afi, 'expenses_list', {});
    expect(expenses.map((entry) => entry.label)).not.toContain('Lessive (assistant)');
    // The model was told what a draft is, and what the tool answered.
    expect(JSON.stringify(model.doGenerateCalls[1]?.prompt)).toContain('"status":"draft"');
  });

  it('what sets a price or a rate is never offered to the model; what acts at once neither', async () => {
    const model = scripted('orders_today', 'ok');
    useModel(model);
    await asPerson(afi, () => askNettio(me(afi), 'Où en est ma journée ?', undefined, [
      { role: 'user', text: 'Bonjour' },
      { role: 'assistant', text: 'Bonjour.' },
    ]));
    const tools = offered(model);
    expect(tools).toEqual(
      expect.arrayContaining(['money_result', 'day_statement', 'orders_today', 'payments_record', 'expenses_record']),
    );
    for (const name of ['catalog_set_price', 'catalog_save_pack', 'team_set_rate']) {
      expect(tools, name).not.toContain(name);
    }
    // The conversation so far goes with the question.
    const prompt = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(prompt).toContain('Bonjour');
    expect(prompt).toContain('Où en est ma journée');
  });

  it('a cashier’s question cannot reach what the cashier cannot open', async () => {
    const model = scripted('orders_today', 'Aujourd’hui : 1 dépôt reçu.');
    useModel(model);
    const outcome = await asPerson(essi, () => askNettio(me(essi), 'Combien le pressing a gagné ?'));
    expect(outcome).toMatchObject({ available: true, sources: ['orders_today'] });
    const tools = offered(model);
    expect(tools).toContain('orders_today');
    for (const name of ['money_result', 'costs_read', 'day_statement', 'team_read']) {
      expect(tools, name).not.toContain(name);
    }
  });

  it('each call is recorded for the organization, as the assistant acting for the person', async () => {
    const { rows } = await db.owner.query<{
      actor_kind: string;
      actor_id: string;
      on_behalf_of_id: string;
      purpose: string;
      model: string;
      input_tokens: number;
    }>(
      `select actor_kind, actor_id, on_behalf_of_id, purpose, model, input_tokens
         from ${db.schema}.kete_ai_usage where organization_id = 'org_acme' order by id`,
    );
    expect(rows.length).toBe(4);
    expect(rows[0]).toMatchObject({
      actor_kind: 'agent',
      actor_id: ASSISTANT,
      on_behalf_of_id: 'usr_afi',
      purpose: 'ask',
      model: 'scripted:scripted-1',
      input_tokens: 240,
    });
  });

  it('a spent budget refuses the question, and says so', async () => {
    await postgresBudgetStore(db.app).setBudget('org_acme', { kind: 'organization', id: 'org_acme' }, 100);
    const model = scripted('orders_today', 'ok');
    useModel(model);
    expect(await asPerson(afi, () => askNettio(me(afi), 'Où en est ma journée ?'))).toEqual({
      available: false,
      reason: 'budget_spent',
    });
    expect(model.doGenerateCalls).toHaveLength(0);
  });

  it('says in its card that it calls AI models, and for what', () => {
    const card = manifest();
    expect(validateManifest(card).ok).toBe(true);
    expect(card.governance?.ai).toMatchObject({ used: true });
    expect(card.capabilities?.map((c) => c.name)).toContain('day_statement');
  });
});

describe('the answer as it is written', () => {
  let db: TestSchema;
  const afi = person('usr_afi', 'owner');

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'starting',
      staffing: 'solo',
      siteName: 'Agoè',
      siteCode: 'A',
    });
  }, 180_000);

  afterAll(async () => {
    useModel(undefined);
    await db.drop();
  });

  const collect = async (events: AsyncIterable<AssistantEvent>) => {
    const seen: AssistantEvent[] = [];
    for await (const event of events) seen.push(event);
    return seen;
  };

  it('without a model, the stream says so and ends', async () => {
    useModel(null);
    const events = await asPerson(afi, () =>
      collect(converse({ userId: afi.userId, organizationId: 'org_acme' }, { question: 'Où en est ma journée ?' })),
    );
    expect(events).toEqual([{ type: 'unavailable', reason: 'not_connected' }]);
  });

  it('streams the words as they come, and names the reading it opened', async () => {
    const finish = (unified: 'tool-calls' | 'stop') => ({
      type: 'finish' as const,
      finishReason: { unified, raw: undefined },
      usage,
    });
    let step = 0;
    useModel(
      new MockLanguageModelV4({
        provider: 'scripted',
        modelId: 'scripted-1',
        doStream: async () => {
          step += 1;
          return {
            stream: simulateReadableStream<never>({
              chunks: (
                step === 1
                  ? [
                      { type: 'stream-start' as const, warnings: [] },
                      { type: 'tool-call' as const, toolCallId: 'call_1', toolName: 'orders_today', input: '{}' },
                      finish('tool-calls'),
                    ]
                  : [
                      { type: 'stream-start' as const, warnings: [] },
                      { type: 'text-start' as const, id: 't1' },
                      { type: 'text-delta' as const, id: 't1', delta: 'Aujourd’hui : ' },
                      { type: 'text-delta' as const, id: 't1', delta: 'aucun dépôt.' },
                      { type: 'text-end' as const, id: 't1' },
                      finish('stop'),
                    ]
              ) as never[],
            }),
          };
        },
      }),
    );
    const events = await asPerson(afi, () =>
      collect(converse({ userId: afi.userId, organizationId: 'org_acme' }, { question: 'Où en est ma journée ?' })),
    );
    expect(events).toEqual([
      { type: 'reading', name: 'orders_today' },
      { type: 'text', delta: 'Aujourd’hui : ' },
      { type: 'text', delta: 'aucun dépôt.' },
      { type: 'done' },
    ]);
  });
});
