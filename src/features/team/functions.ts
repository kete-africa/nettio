import { createServerFn } from '@tanstack/react-start';
import { perform } from '@/platform/screen';
import type { TeamWork } from './capabilities';
import type { PersonPay } from './domain/pay';
import type { PersonPresence } from './domain/presence';
import { clockInInput, rateInput, workInput } from './team.record';

/** The work and the pay of the team for a month, for whoever reads it; null otherwise. */
export const fetchTeamWork = createServerFn({ method: 'GET' })
  .validator((input: unknown) => workInput.parse(input ?? {}))
  .handler(async ({ data }): Promise<TeamWork | null> => {
    const read = await perform<TeamWork>('team_work', data);
    return read.ok ? read.output : null;
  });

/** The person's own work this month; null when she does not work in the workshop. */
export const fetchMyWork = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PersonPay | null> => {
    const read = await perform<{ month: string; mine: PersonPay | null }>('my_work', {});
    return read.ok ? read.output.mine : null;
  },
);

/** The names of the team, to say who a wage was handed to. */
export const fetchTeamNames = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<{ userId: string; name: string }[]>('team_names', {});
  return read.ok ? read.output : [];
});

export const saveRate = createServerFn({ method: 'POST' })
  .validator((input: unknown) => rateInput.parse(input))
  .handler(({ data }) =>
    perform<{ stepId: string; amount: number | null }>('team_set_rate', data),
  );

/** The person's own presence; null when she does not clock. */
export const fetchMyPresence = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PersonPresence | null> => {
    const read = await perform<{ mine: PersonPresence | null }>('my_presence', {});
    return read.ok ? read.output.mine : null;
  },
);

/** The team's presence today, for whoever reads it; null otherwise. */
export const fetchTeamPresence = createServerFn({ method: 'GET' }).handler(
  async (): Promise<PersonPresence[] | null> => {
    const read = await perform<{ people: PersonPresence[] }>('team_presence', {});
    return read.ok ? read.output.people : null;
  },
);

export const clockIn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => clockInInput.parse(input ?? {}))
  .handler(({ data }) => perform<{ present: boolean }>('presence_clock_in', data));

export const clockOut = createServerFn({ method: 'POST' }).handler(() =>
  perform<{ present: boolean; minutes: number }>('presence_clock_out', {}),
);
