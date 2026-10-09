import type { TagTone } from '@kete/design';
import { methodWords } from '@/features/orders/ui/words';
import type { PaymentMethod } from '@/features/orders';
import { formatMonth } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { QuoteStatus } from '../domain/accounts';
import type { CreditEntry } from '../infrastructure/accounts.tables';

type State = QuoteStatus | 'expired';

export const quoteStateWords: Record<State, () => string> = {
  open: m.quote_state_open,
  accepted: m.quote_state_accepted,
  refused: m.quote_state_refused,
  expired: m.quote_state_expired,
};

export const quoteStateTones: Record<State, TagTone> = {
  open: 'neutral',
  accepted: 'validated',
  refused: 'neutral',
  expired: 'error',
};

const methodOf = (method: string): string =>
  method in methodWords ? methodWords[method as PaymentMethod]() : method;

/** A movement of a customer's credit, in a line — or, `methodOnly`, just the way it was paid. */
export function creditWords(
  entry: Pick<CreditEntry, 'kind' | 'method' | 'orderNumber' | 'subscriptionName' | 'period'>,
  methodOnly = false,
): string {
  if (methodOnly) return methodOf(entry.method);
  if (entry.kind === 'spend') return m.credit_entry_spend({ number: entry.orderNumber ?? '' });
  if (entry.kind === 'returned') return m.credit_entry_returned({ number: entry.orderNumber ?? '' });
  if (entry.subscriptionName) {
    return m.credit_entry_subscription({
      name: entry.subscriptionName,
      month: entry.period ? formatMonth(entry.period) : '',
      method: methodOf(entry.method),
    });
  }
  return m.credit_entry_top_up({ method: methodOf(entry.method) });
}
