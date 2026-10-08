import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { readSettings } from '@/features/business';
import { monthFigures } from '@/features/money';
import { listSessions } from '@/features/money/infrastructure/money.tables';
import { dayBounds } from '@/features/orders';
import { daySummary } from '@/features/orders/infrastructure/orders.tables';
import { listIncidents } from '@/features/workshop/infrastructure/units';
import { RuleError } from '@/lib/rule-error';
import { dayStatement, type StatementFacts } from './domain/statement';
import { statementWords } from './statement-words';

/**
 * What Nettio says by itself. The day's statement is computed by code and worded with fixed
 * sentences: a copilot reads it as it is, and has nothing to compute.
 */
export const assistantCapabilities = [
  defineCapability({
    name: 'day_statement',
    description:
      'The statement of a day (today by default), ready to read: what was cashed, deposits and pieces received, what is ready, late or sleeping, what customers owe, the tills and their gaps, open incidents, and the month so far with what the owner took. Figures computed by code; quote it as it is.',
    permission: 'money:read',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({
      day: z.iso.date().optional(),
      language: z.enum(['fr', 'en']).default('fr'),
    }),
    async run(input, { db }) {
      const settings = await readSettings(db);
      if (!settings) throw new RuleError('not_set_up');
      const bounds = dayBounds(input.day);
      const day = bounds.from.toISOString().slice(0, 10);
      const summary = await daySummary(db, { ...bounds, dormantDays: settings.dormantDays });
      const tills = await listSessions(db, { limit: 50 });
      const figures = await monthFigures(db, day.slice(0, 7));
      const facts: StatementFacts = {
        ...summary,
        belowCost: figures.content.belowCost,
        openTills: tills.filter((till) => !till.closedAt).length,
        closedTills: tills
          .filter((till) => till.closedAt && till.closedAt >= bounds.from && till.closedAt < bounds.to)
          .map((till) => ({ cashier: till.cashierName, gap: till.gap ?? 0 })),
        openIncidents: (await listIncidents(db, { openOnly: true })).length,
        month: figures.result,
      };
      return {
        day,
        business: settings.businessName,
        lines: dayStatement(facts, statementWords(input.language)),
        facts,
      };
    },
  }),
];
