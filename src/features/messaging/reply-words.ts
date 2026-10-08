import * as m from '@/paraglide/messages.js';
import type { ReplyWords } from './delivery';

/**
 * The words Nettio answers a customer with, in the laundry's name. In French: the language of the
 * laundries Nettio serves first; a laundry's own language is a setting to come.
 */
export function replyWords(locale: 'fr' | 'en' = 'fr'): ReplyWords {
  const options = { locale };
  return {
    stopped: (business) => m.reply_stopped({ business }, options),
    linked: (business) => m.reply_linked({ business }, options),
    none: (business) => m.reply_none({ business }, options),
    inProgress: (order) => m.reply_in_progress(order, options),
    ready: (order) => m.reply_ready(order, options),
    readyPaid: (order) => m.reply_ready_paid(order, options),
    signature: (business) => m.reply_signature({ business }, options),
  };
}

/** The words Nettio proposes for each kind of message; the laundry changes them as it likes. */
export function defaultTemplates(locale: 'fr' | 'en' = 'fr'): Record<'receipt' | 'ready' | 'reminder', string> {
  // The placeholders are written between braces: the catalog must not read them as its own.
  const fill = { client: '{client}', numero: '{numero}', contenu: '{contenu}', total: '{total}', paye: '{paye}', reste: '{reste}', date: '{date}', pressing: '{pressing}' };
  return {
    receipt: m.template_receipt(fill, { locale }),
    ready: m.template_ready(fill, { locale }),
    reminder: m.template_reminder(fill, { locale }),
  };
}
