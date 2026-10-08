import { assertOrganizationIsolation, type TestSchema } from '@kete/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Site } from '../src/features/business';
import type { Catalog } from '../src/features/catalog';
import type { CashSession } from '../src/features/money';
import type { TeamWork } from '../src/features/team/capabilities';
import { monthPeriod, payOf, type PersonPay, type WorkLine } from '../src/features/team/domain/pay';
import type { WorkUnit } from '../src/features/workshop';
import { registry } from '../src/platform/registry';
import { asPerson } from '../src/platform/rights';
import { act, agentFor, done, freshSchema, hire, person } from './helpers';

// The team's work and pay (specs/015-team-pay): counted from the steps each person signed in the
// workshop, at the rates the owner set — Nettio proposes none — minus what she was handed.

describe('what a person earns, a pure function', () => {
  const work: WorkLine[] = [
    { userId: 'usr_yao', stepId: 'stp_wash', stepName: 'Lavage', pieces: 40, redone: 2 },
    { userId: 'usr_yao', stepId: 'stp_iron', stepName: 'Repassage', pieces: 25, redone: 0 },
    { userId: 'usr_ama', stepId: 'stp_iron', stepName: 'Repassage', pieces: 10.5, redone: 0 },
    { userId: 'usr_ama', stepId: 'stp_pack', stepName: 'Emballage', pieces: 12, redone: 0 },
  ];
  const names = new Map([
    ['usr_yao', 'Yao'],
    ['usr_ama', 'Ama'],
    ['usr_kofi', 'Kofi'],
  ]);

  it('pieces times the step’s rate, minus what she was handed — reworks apart', () => {
    const pay = payOf({
      work,
      rates: new Map([
        ['stp_wash', 25],
        ['stp_iron', 50],
      ]),
      paid: new Map([['usr_yao', 1_000]]),
      names,
    });
    expect(pay.map((person) => person.name)).toEqual(['Ama', 'Yao']);
    expect(pay[1]).toEqual({
      userId: 'usr_yao',
      name: 'Yao',
      lines: [
        { stepId: 'stp_wash', stepName: 'Lavage', pieces: 40, redone: 2, rate: 25, amount: 1_000 },
        { stepId: 'stp_iron', stepName: 'Repassage', pieces: 25, redone: 0, rate: 50, amount: 1_250 },
      ],
      earned: 2_250,
      paid: 1_000,
      left: 1_250,
      unrated: 0,
    });
    // A step with no rate is done, shown, and earns nothing; kilos round to the franc.
    expect(pay[0]).toMatchObject({ earned: 525, paid: 0, left: 525, unrated: 12 });
    expect(pay[0]?.lines[1]).toMatchObject({ rate: null, amount: 0 });
  });

  it('with no rate at all, the work is counted and nothing is earned', () => {
    const pay = payOf({ work, rates: new Map(), paid: new Map(), names });
    expect(pay.every((person) => person.earned === 0 && person.left === 0)).toBe(true);
    expect(pay.find((person) => person.userId === 'usr_yao')?.unrated).toBe(65);
  });

  it('an advance to someone who signed no step is never lost', () => {
    const pay = payOf({ work: [], rates: new Map(), paid: new Map([['usr_kofi', 5_000]]), names });
    expect(pay).toEqual([
      { userId: 'usr_kofi', name: 'Kofi', lines: [], earned: 0, paid: 5_000, left: -5_000, unrated: 0 },
    ]);
  });

  it('a month is a period: its first day, and the first day of the next', () => {
    expect(monthPeriod('2026-10')).toEqual({ from: '2026-10-01', to: '2026-11-01' });
    expect(monthPeriod('2026-12')).toEqual({ from: '2026-12-01', to: '2027-01-01' });
  });
});

describe('the team’s work and pay', () => {
  let db: TestSchema;
  let counter: Site;
  let read: Catalog;
  const afi = person('usr_afi', 'owner');
  const yao = person('usr_yao', 'member'); // workshop
  const ama = person('usr_ama', 'member'); // workshop
  const essi = person('usr_essi', 'member'); // cashier
  const month = new Date().toISOString().slice(0, 7);
  const today = new Date().toISOString().slice(0, 10);
  const service = (name: string) => read.services.find((s) => s.name === name);
  const step = (name: string) => read.steps.find((s) => s.name === name)?.stepId ?? '';
  const article = (name: string) => read.articles.find((a) => a.name === name)?.articleId ?? '';
  const team = () => done<TeamWork>(afi, 'team_work', {});
  const of = (view: TeamWork, userId: string) => view.people.find((p) => p.userId === userId);
  const units = async (orderId: string) =>
    (await done<{ units: WorkUnit[] }>(afi, 'workshop_order', { orderId })).units;
  const advance = (unitId: string, who: typeof yao) => done(who, 'workshop_advance', { unitId });

  beforeAll(async () => {
    db = await freshSchema();
    await done(afi, 'business_set_up', {
      businessName: 'Pressing Afi',
      profile: 'starting',
      staffing: 'team',
      siteName: 'Agoè',
      siteCode: 'A',
    });
    counter = (await done<{ sites: Site[] }>(afi, 'business_overview', {})).sites[0] as Site;
    read = await done<Catalog>(afi, 'catalog_read', {});
    await done(afi, 'catalog_save_service', {
      ...service('Lavage et repassage'),
      stepIds: [step('Lavage'), step('Repassage')],
    });
    await done(afi, 'catalog_set_price', {
      serviceId: service('Lavage et repassage')?.serviceId,
      articleId: article('Chemise'),
      amount: 500,
    });
    read = await done<Catalog>(afi, 'catalog_read', {});
    await hire(yao, 'workshop');
    await hire(ama, 'workshop');
    await hire(essi, 'cashier');
    // One deposit of 6 shirts: Yao washes, Ama irons; an incident sends it back to the wash, and
    // Yao washes it again.
    const { orderId } = await done<{ orderId: string }>(afi, 'orders_receive', {
      siteId: counter.siteId,
      phone: '90 12 34 56',
      customerName: 'Mme Adjovi',
      lines: [{ serviceId: service('Lavage et repassage')?.serviceId, articleId: article('Chemise'), quantity: 6 }],
    });
    const [unit] = await units(orderId);
    const unitId = unit?.unitId ?? '';
    await advance(unitId, yao);
    await done(ama, 'workshop_report_incident', {
      unitId,
      kind: 'stain_left',
      note: 'tache au col',
      backToStepId: step('Lavage'),
    });
    await advance(unitId, yao);
    await advance(unitId, ama);
  }, 240_000);

  afterAll(async () => {
    await db.drop();
  });

  it('counts each person’s pieces at each step; a piece passed again is counted apart', async () => {
    const view = await team();
    expect(view.month).toBe(month);
    expect(of(view, 'usr_yao')?.lines).toEqual([
      { stepId: step('Lavage'), stepName: 'Lavage', pieces: 6, redone: 6, rate: null, amount: 0 },
    ]);
    expect(of(view, 'usr_ama')?.lines).toEqual([
      { stepId: step('Repassage'), stepName: 'Repassage', pieces: 6, redone: 0, rate: null, amount: 0 },
    ]);
    // No rate was set: the work is counted, nothing is earned, and no rate is proposed.
    expect(view.totals).toEqual({ earned: 0, paid: 0, left: 0 });
    expect(view.rates.every((rate) => rate.amount === null)).toBe(true);
    expect(view.rates.map((rate) => rate.name)).toEqual(expect.arrayContaining(['Lavage', 'Repassage']));
  });

  it('the rates are the owner’s: set by who may, prepared by an agent, refused for an unknown step', async () => {
    const input = { stepId: step('Lavage'), amount: 25 };
    expect(await act(yao, 'team_set_rate', input)).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(afi, 'team_set_rate', { stepId: 'stp_unknown', amount: 25 })).toEqual({
      ok: false,
      code: 'not_found',
    });
    const prepared = await asPerson(afi, () => registry.invoke({ ...agentFor(afi), name: 'team_set_rate', input }));
    expect(prepared).toMatchObject({ status: 'draft' });
    expect((await team()).rates.find((rate) => rate.name === 'Lavage')?.amount).toBeNull();
    await done(afi, 'team_set_rate', input);
    await done(afi, 'team_set_rate', { stepId: step('Repassage'), amount: 50 });
    const view = await team();
    expect(of(view, 'usr_yao')).toMatchObject({ earned: 150, paid: 0, left: 150 });
    expect(of(view, 'usr_ama')).toMatchObject({ earned: 300, paid: 0, left: 300 });
    expect(view.totals).toEqual({ earned: 450, paid: 0, left: 450 });
  }, 120_000);

  it('an advance is wages handed to a person: deducted from what her work earns', async () => {
    const expense = {
      spentOn: today,
      label: 'Avance Yao',
      category: 'wages',
      behavior: 'fixed',
      amount: 100,
      paidFrom: 'mobile_money',
    };
    // Handed to someone: wages only, on its day, to a person of the team.
    expect(await act(afi, 'expenses_record', { ...expense, category: 'detergent', paidTo: 'usr_yao' })).toEqual({
      ok: false,
      code: 'paid_to_needs_wages',
    });
    expect(
      await act(afi, 'expenses_record', { ...expense, paidFrom: 'bank', recurring: true, paidTo: 'usr_yao' }),
    ).toEqual({ ok: false, code: 'paid_to_needs_wages' });
    expect(await act(afi, 'expenses_record', { ...expense, paidTo: 'usr_nobody' })).toEqual({
      ok: false,
      code: 'not_found',
    });
    await done(afi, 'expenses_record', { ...expense, paidTo: 'usr_yao' });
    const { expenseId } = await done<{ expenseId: string }>(afi, 'expenses_record', {
      ...expense,
      label: 'Avance Ama',
      amount: 500,
      paidTo: 'usr_ama',
    });
    let view = await team();
    expect(of(view, 'usr_yao')).toMatchObject({ earned: 150, paid: 100, left: 50 });
    // Handed ahead of her work: the screen says how much.
    expect(of(view, 'usr_ama')).toMatchObject({ earned: 300, paid: 500, left: -200 });
    expect(view.totals).toEqual({ earned: 450, paid: 600, left: -150 });
    // An advance recorded by mistake and voided counts nowhere.
    await done(afi, 'expenses_void', { expenseId, reason: 'saisie en double' });
    view = await team();
    expect(of(view, 'usr_ama')).toMatchObject({ paid: 0, left: 300 });
    // It is a charge like any wage: the month's result carries it.
    const { expenses } = await done<{ expenses: { label: string; paidTo: string | null }[] }>(afi, 'expenses_list', {});
    expect(expenses.find((entry) => entry.label === 'Avance Yao')?.paidTo).toBe('usr_yao');
  }, 120_000);

  it('from the till, an advance leaves its trace in the till like any expense', async () => {
    await done(afi, 'cash_open', { siteId: counter.siteId, openingFloat: 5_000 });
    await done(afi, 'expenses_record', {
      spentOn: today,
      label: 'Avance Yao (caisse)',
      category: 'wages',
      behavior: 'fixed',
      amount: 50,
      paidFrom: 'till',
      siteId: counter.siteId,
      paidTo: 'usr_yao',
    });
    const [till] = await done<CashSession[]>(afi, 'cash_sessions', {});
    expect(till?.expected).toBe(4_950);
    expect(of(await team(), 'usr_yao')).toMatchObject({ paid: 150, left: 0 });
  }, 120_000);

  it('each person reads her own work — nobody else’s; the team’s is for who may', async () => {
    const mine = await done<{ month: string; mine: PersonPay | null }>(yao, 'my_work', {});
    expect(mine.mine).toMatchObject({ userId: 'usr_yao', earned: 150, paid: 150, left: 0 });
    expect(mine.mine?.lines).toHaveLength(1);
    expect((await done<{ mine: PersonPay | null }>(ama, 'my_work', {})).mine).toMatchObject({
      userId: 'usr_ama',
      earned: 300,
    });
    expect(await act(yao, 'team_work', {})).toEqual({ ok: false, code: 'not_allowed' });
    expect(await act(essi, 'team_work', {})).toEqual({ ok: false, code: 'not_allowed' });
    // A cashier does not work in the workshop: she has no line of her own to read.
    expect(await act(essi, 'my_work', {})).toEqual({ ok: false, code: 'not_allowed' });
  }, 120_000);

  it('another month has its own work: nothing was done last year', async () => {
    const view = await done<TeamWork>(afi, 'team_work', { month: '2025-01' });
    expect(view.people).toEqual([]);
    expect(view.totals).toEqual({ earned: 0, paid: 0, left: 0 });
  });

  it('a rate removed: the step is done, and no longer paid by the piece', async () => {
    await done(afi, 'team_set_rate', { stepId: step('Lavage'), amount: null });
    const view = await team();
    expect(of(view, 'usr_yao')).toMatchObject({ earned: 0, unrated: 6, left: -150 });
  });

  it('one laundry’s rates are never another’s', async () => {
    await assertOrganizationIsolation({
      app: db.app,
      table: 'piece_rates',
      organizations: ['org_x', 'org_y'],
      insert: async (client, organizationId) => {
        await client.query(
          `insert into ${db.schema}.piece_rates (organization_id, step_id, amount)
           values ('${organizationId}', 'stp_any', 25)`,
        );
      },
    });
  }, 180_000);
});
