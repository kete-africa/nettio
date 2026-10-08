import { getLocale } from '@/paraglide/runtime.js';

// The formats of the doctrine: « 1 103 000 F CFA » (thousands apart, the currency after, no
// decimals), « 30 % », « 7 août 2026 » in a sentence.

const NARROW = /[  ]/g;

/** A whole number with its thousands apart: 1 103 000. */
export function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
    .format(value)
    .replace(NARROW, ' ');
}

/** An amount of money: 1 103 000 F CFA. */
export function formatMoney(amount: number): string {
  return `${formatNumber(Math.round(amount))} F CFA`;
}

export function formatPercent(value: number): string {
  return `${formatNumber(value)} %`;
}

/** A day in a sentence: 7 août 2026. */
export function formatDay(date: Date | string): string {
  return new Intl.DateTimeFormat(getLocale(), { dateStyle: 'long', timeZone: 'Africa/Lome' }).format(
    new Date(date),
  );
}

/** A day and an hour: sam. 10 oct., 17:00. */
export function formatDayTime(date: Date | string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Africa/Lome',
  }).format(new Date(date));
}
