// Who is at work, and for how long (specs/024-presence). Pure: a person clocks in and out
// herself; this file only counts what she declared.

/** A stretch of presence: open while `endedAt` is null. */
export interface Period {
  userId: string;
  startedAt: Date;
  endedAt: Date | null;
}

export interface PersonPresence {
  userId: string;
  name: string;
  /** At work now. */
  present: boolean;
  /** When her open stretch began; null when she is not at work. */
  since: Date | null;
  /** Minutes at work in the day asked for; an open stretch counts up to `now`. */
  dayMinutes: number;
  /** Minutes at work in the month of that day. */
  monthMinutes: number;
}

const MINUTE = 60_000;

/** The minutes a period spends inside a window; an open period runs up to `now`. */
export function minutesWithin(period: Period, window: { from: Date; to: Date }, now: Date): number {
  const start = Math.max(period.startedAt.getTime(), window.from.getTime());
  const end = Math.min((period.endedAt ?? now).getTime(), window.to.getTime());
  return end > start ? Math.floor((end - start) / MINUTE) : 0;
}

/**
 * Each person's presence: whether she is in, since when, and her minutes of the day and of the
 * month. People who never clocked in appear too, at zero — the owner sees who did not come.
 * Sorted: those at work first, then by name.
 */
export function presenceOf(input: {
  people: { userId: string; name: string }[];
  periods: Period[];
  day: { from: Date; to: Date };
  month: { from: Date; to: Date };
  now: Date;
}): PersonPresence[] {
  return input.people
    .map((person) => {
      const mine = input.periods.filter((period) => period.userId === person.userId);
      const open = mine.find((period) => period.endedAt === null) ?? null;
      const sum = (window: { from: Date; to: Date }) =>
        mine.reduce((total, period) => total + minutesWithin(period, window, input.now), 0);
      return {
        userId: person.userId,
        name: person.name,
        present: open !== null,
        since: open?.startedAt ?? null,
        dayMinutes: sum(input.day),
        monthMinutes: sum(input.month),
      };
    })
    .sort((a, b) => Number(b.present) - Number(a.present) || a.name.localeCompare(b.name, 'fr'));
}

/** 7 h 05 from 425 minutes. */
export const hoursAndMinutes = (minutes: number): { hours: number; minutes: number } => ({
  hours: Math.floor(minutes / 60),
  minutes: minutes % 60,
});
