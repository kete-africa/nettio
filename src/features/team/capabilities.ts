import { defineCapability } from '@kete/capabilities';
import type { SqlExecutor } from '@kete/tenancy';
import { listStaff } from '@/features/business/infrastructure/business.tables';
import { readCatalog } from '@/features/catalog';
import { personBehind } from '@/lib/actor';
import { dayBounds } from '@/features/orders';
import { clockIn, clockOut, setPieceRate } from './commands';
import { monthPeriod, payOf, type PersonPay } from './domain/pay';
import { presenceOf, type PersonPresence } from './domain/presence';
import { periodsWithin } from './infrastructure/presence.tables';
import { handedTo, readRates, workDone } from './infrastructure/team.tables';
import { clockInInput, clockOutInput, namesInput, presenceInput, rateInput, workInput } from './team.record';

export interface TeamWork {
  month: string;
  /** Each step of the workshop with the laundry's rate for one piece; null: not paid by the piece. */
  rates: { stepId: string; name: string; amount: number | null }[];
  people: PersonPay[];
  totals: { earned: number; paid: number; left: number };
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

/** The presence of the team — or of one person — on a day, with the month's minutes. */
async function presence(db: SqlExecutor, day: string | undefined, userId?: string): Promise<PersonPresence[]> {
  const bounds = dayBounds(day);
  const month = monthPeriod(bounds.from.toISOString().slice(0, 7));
  const window = { from: new Date(`${month.from}T00:00:00Z`), to: new Date(`${month.to}T00:00:00Z`) };
  const staff = (await listStaff(db)).filter((member) => member.active && (!userId || member.userId === userId));
  return presenceOf({
    people: staff.map((member) => ({ userId: member.userId, name: member.name })),
    periods: await periodsWithin(db, window, userId),
    day: bounds,
    month: window,
    now: new Date(),
  });
}

async function teamWork(db: SqlExecutor, month: string, userId?: string): Promise<TeamWork> {
  const period = monthPeriod(month);
  const [catalog, rates, staff, work, paid] = [
    await readCatalog(db),
    await readRates(db),
    await listStaff(db),
    await workDone(db, period, userId),
    await handedTo(db, period, userId),
  ];
  const people = payOf({
    work,
    rates,
    paid,
    names: new Map(staff.map((member) => [member.userId, member.name])),
  });
  return {
    month,
    rates: catalog.steps
      .filter((step) => step.active || rates.has(step.stepId))
      .map((step) => ({ stepId: step.stepId, name: step.name, amount: rates.get(step.stepId) ?? null })),
    people,
    totals: {
      earned: people.reduce((sum, person) => sum + person.earned, 0),
      paid: people.reduce((sum, person) => sum + person.paid, 0),
      left: people.reduce((sum, person) => sum + person.left, 0),
    },
  };
}

/**
 * What a screen, a copilot or an agent may do with the team's work and pay. The figures are
 * counted from the steps signed in the workshop and the money handed; a rate is the owner's
 * decision — an agent only prepares it (level 3).
 */
export const teamCapabilities = [
  defineCapability({
    name: 'team_work',
    description:
      'The work of each person in the workshop for a month (the current one by default): pieces passed at each step, pieces passed again after a rework (counted apart, not paid), what they earn at the laundry’s piece rates, what each person was already handed (advances, pay), and what is left. Figures computed by code.',
    permission: 'pay:read',
    autonomy: 1,
    classification: 'confidential',
    input: workInput,
    run: (input, { db }) => teamWork(db, input.month ?? thisMonth()),
  }),
  defineCapability({
    name: 'my_work',
    description:
      'The work of the person herself in the workshop for a month (the current one by default): her pieces at each step, what they earn at the laundry’s piece rates, what she was handed, what is left. Nobody else’s.',
    permission: 'workshop:operate',
    autonomy: 1,
    input: workInput,
    async run(input, { db, actor }) {
      const me = personBehind(actor);
      const all = await teamWork(db, input.month ?? thisMonth(), me);
      const mine = all.people.find((person) => person.userId === me) ?? null;
      return { month: all.month, mine };
    },
  }),
  defineCapability({
    name: 'team_presence',
    description:
      'Who is at work now, since when, and each person’s minutes at work on a day (today by default) and in its month — as each one clocked in and out herself. People who did not clock in appear at zero.',
    permission: 'presence:read',
    autonomy: 1,
    classification: 'confidential',
    input: presenceInput,
    async run(input, { db }) {
      return { people: await presence(db, input.day) };
    },
  }),
  defineCapability({
    name: 'my_presence',
    description: 'Whether the person herself is clocked in, since when, and her minutes today and this month.',
    permission: 'presence:clock',
    autonomy: 1,
    input: presenceInput,
    async run(input, { db, actor }) {
      const [mine] = await presence(db, input.day, personBehind(actor));
      return { mine: mine ?? null };
    },
  }),
  defineCapability({
    name: 'presence_clock_in',
    description: 'The person says she starts work now. For herself only.',
    permission: 'presence:clock',
    autonomy: 3,
    input: clockInInput,
    command: clockIn,
    draft: { recordType: 'clock_in' },
  }),
  defineCapability({
    name: 'presence_clock_out',
    description: 'The person says she is done for now.',
    permission: 'presence:clock',
    autonomy: 3,
    input: clockOutInput,
    command: clockOut,
    draft: { recordType: 'clock_out' },
  }),
  defineCapability({
    name: 'team_names',
    description:
      'The names of the people of the team, to say who a wage or an advance was handed to.',
    permission: 'expenses:write',
    autonomy: 1,
    input: namesInput,
    async run(_input, { db }) {
      return (await listStaff(db))
        .filter((member) => member.active)
        .map((member) => ({ userId: member.userId, name: member.name }));
    },
  }),
  defineCapability({
    name: 'team_set_rate',
    description:
      'Sets what the laundry pays for one piece (or one kilo) passed at a workshop step, or removes it (amount null). The owner’s decision: never propose a rate.',
    permission: 'pay:manage',
    autonomy: 3,
    input: rateInput,
    command: setPieceRate,
    draft: { recordType: 'piece_rate' },
  }),
];
