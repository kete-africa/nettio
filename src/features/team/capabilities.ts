import { defineCapability } from '@kete/capabilities';
import type { SqlExecutor } from '@kete/tenancy';
import { listStaff } from '@/features/business/infrastructure/business.tables';
import { readCatalog } from '@/features/catalog';
import { personBehind } from '@/lib/actor';
import { setPieceRate } from './commands';
import { monthPeriod, payOf, type PersonPay } from './domain/pay';
import { handedTo, readRates, workDone } from './infrastructure/team.tables';
import { namesInput, rateInput, workInput } from './team.record';

export interface TeamWork {
  month: string;
  /** Each step of the workshop with the laundry's rate for one piece; null: not paid by the piece. */
  rates: { stepId: string; name: string; amount: number | null }[];
  people: PersonPay[];
  totals: { earned: number; paid: number; left: number };
}

const thisMonth = () => new Date().toISOString().slice(0, 7);

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
