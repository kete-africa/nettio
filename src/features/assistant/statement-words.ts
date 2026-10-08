import * as m from '@/paraglide/messages.js';
import type { StatementWords } from './domain/statement';

const plain = (amount: number, locale: 'fr' | 'en') =>
  new Intl.NumberFormat(locale === 'fr' ? 'fr-FR' : 'en-GB')
    .format(Math.round(Math.abs(amount)))
    .replace(/[  ]/g, ' ');

/** The words of the day's statement, in a language; plain spaces, so it reads well in a message. */
export function statementWords(locale: 'fr' | 'en' = 'fr'): StatementWords {
  const options = { locale };
  return {
    money: (amount) => `${amount < 0 ? '− ' : ''}${plain(amount, locale)} F CFA`,
    signed: (amount) => `${amount < 0 ? '−' : '+'} ${plain(amount, locale)} F CFA`,
    cashed: (input) => m.statement_cashed(input, options),
    nothing: () => m.statement_nothing({}, options),
    ready: (input) => m.statement_ready(input, options),
    late: (input) => m.statement_late(input, options),
    dormant: (input) => m.statement_dormant(input, options),
    outstanding: (input) => m.statement_outstanding(input, options),
    belowCost: (input) => m.statement_below_cost(input, options),
    tillRight: (input) => m.statement_till_right(input, options),
    tillGap: (input) => m.statement_till_gap(input, options),
    tillsOpen: (input) => m.statement_tills_open(input, options),
    incidents: (input) => m.statement_incidents(input, options),
    month: (input) => m.statement_month(input, options),
    draws: (input) => m.statement_draws(input, options),
  };
}
