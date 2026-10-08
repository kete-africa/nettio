import type { SqlExecutor } from '@kete/tenancy';
import { readSettings } from '@/features/business';
import { ChannelError, type Channels } from '@/features/messaging/ports';
import { monthFigures } from '@/features/money';
import { listSessions } from '@/features/money/infrastructure/money.tables';
import { dayBounds } from '@/features/orders';
import { daySummary } from '@/features/orders/infrastructure/orders.tables';
import { listIncidents } from '@/features/workshop/infrastructure/units';
import { RuleError } from '@/lib/rule-error';
import {
  asMessage,
  asOneValue,
  destinationsOf,
  type SendingOutcome,
  type StatementChannel,
} from './domain/sending';
import { dayStatement, type StatementFacts } from './domain/statement';
import {
  claimDay,
  noteOutcome,
  readDelivery,
  telegramChatOf,
} from './infrastructure/delivery.tables';
import { statementWords } from './statement-words';

export interface DayStatement {
  day: string;
  business: string;
  lines: string[];
  facts: StatementFacts;
}

/**
 * The statement of a day, computed by code and worded with fixed sentences: the same for the
 * screen, a copilot, and the sending of the evening.
 */
export async function statementOf(
  db: SqlExecutor,
  input: { day?: string | undefined; language: 'fr' | 'en' },
): Promise<DayStatement> {
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
}

/** What the sending needs from the deployment: its channels, and how an e-mail leaves. */
export interface SendingPorts {
  channels: Channels;
  /** Null when no e-mail sender is connected. */
  mail: ((to: string, statement: StatementMail) => Promise<void>) | null;
  /** The approved template that carries a statement, when the messaging provider asks for one. */
  whatsappTemplate: string;
}

export interface StatementMail {
  business: string;
  day: string;
  lines: string[];
  language: 'fr' | 'en';
}

const sayDay = (day: string, language: 'fr' | 'en'): string =>
  new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));

/**
 * Sends the statement of a day to where the laundry decided, on each channel it gave. A channel
 * that is not connected is said as such; a refusal keeps its reason. Nothing is simulated.
 */
export async function sendStatement(
  db: SqlExecutor,
  ports: SendingPorts,
  input: { day?: string | undefined } = {},
): Promise<SendingOutcome[]> {
  const delivery = await readDelivery(db);
  const statement = await statementOf(db, { day: input.day, language: delivery.language });
  const said = sayDay(statement.day, delivery.language);
  const text = asMessage({ business: statement.business, day: said, lines: statement.lines });
  const outcome: SendingOutcome[] = [];
  const attempt = async (channel: StatementChannel, send: (() => Promise<void>) | null) => {
    if (!send) {
      outcome.push({ channel, status: 'not_connected', reason: '' });
      return;
    }
    try {
      await send();
      outcome.push({ channel, status: 'sent', reason: '' });
    } catch (error) {
      outcome.push({
        channel,
        status: 'failed',
        reason: error instanceof ChannelError ? error.reason : 'network',
      });
    }
  };
  for (const channel of destinationsOf(delivery)) {
    if (channel === 'email') {
      const { mail } = ports;
      await attempt(
        channel,
        mail &&
          (() =>
            mail(delivery.email, {
              business: statement.business,
              day: said,
              lines: statement.lines,
              language: delivery.language,
            })),
      );
    } else if (channel === 'whatsapp') {
      const whatsapp = ports.channels.whatsapp;
      const { sendTemplate } = whatsapp ?? {};
      // The provider addresses a phone by its digits.
      const to = delivery.whatsapp.replace(/\D/g, '');
      await attempt(
        channel,
        whatsapp &&
          (() =>
            ports.whatsappTemplate && sendTemplate
              ? sendTemplate.call(whatsapp, to, {
                  name: ports.whatsappTemplate,
                  language: delivery.language,
                  parameters: [statement.business, said, asOneValue(statement.lines)],
                })
              : whatsapp.sendText(to, text)),
      );
    } else {
      const telegram = ports.channels.telegram;
      const chat = await telegramChatOf(db);
      await attempt(channel, telegram && chat ? () => telegram.sendText(chat, text) : null);
    }
  }
  return outcome;
}

/**
 * The sending of the evening, for one laundry: taken once for the day (two workers never send it
 * twice), then sent. Returns null when another caller already took it.
 */
export async function sendDueStatement(
  db: SqlExecutor,
  ports: SendingPorts,
  now: Date,
): Promise<SendingOutcome[] | null> {
  const day = now.toISOString().slice(0, 10);
  if (!(await claimDay(db, day))) return null;
  const outcome = await sendStatement(db, ports, { day });
  // What the evening's sending became: the screen says it, channel by channel.
  await noteOutcome(db, outcome);
  return outcome;
}
