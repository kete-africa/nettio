import { formatSigned } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { Alert, AlertKind } from '../domain/alerts';

/** Where an answer comes from, in the person's words: the reading the model called. */
export const sourceWords: Record<string, () => string> = {
  money_result: m.source_money_result,
  costs_read: m.source_costs_read,
  expenses_list: m.source_expenses_list,
  cash_sessions: m.source_cash_sessions,
  day_statement: m.source_day_statement,
  orders_today: m.source_orders_today,
  orders_list: m.source_orders_list,
  orders_get: m.source_orders_get,
  customers_search: m.source_customers,
  customers_get: m.source_customers,
  customers_lookup: m.source_customers,
  workshop_queue: m.source_workshop_queue,
  workshop_incidents: m.source_workshop_queue,
  workshop_order: m.source_workshop_queue,
  catalog_read: m.source_catalog_read,
  business_overview: m.source_business_overview,
  team_read: m.source_team_read,
  messages_list: m.source_messages,
  messages_settings: m.source_messages,
  invoices_list: m.source_invoices,
  invoices_get: m.source_invoices,
  invoices_account: m.source_invoices,
  invoices_of_order: m.source_invoices,
  team_work: m.source_team_work,
  my_work: m.source_team_work,
  statement_delivery: m.source_day_statement,
};

/** The screen where the person reads the same thing herself: a source is one touch away. */
export const sourcePlaces: Record<string, string> = {
  money_result: '/argent/resultat',
  costs_read: '/argent/couts',
  expenses_list: '/argent/depenses',
  cash_sessions: '/argent/caisse',
  day_statement: '/aujourdhui',
  orders_today: '/aujourdhui',
  orders_list: '/depots',
  customers_search: '/clients',
  workshop_queue: '/atelier',
  workshop_incidents: '/atelier',
  catalog_read: '/pressing/catalogue',
  business_overview: '/pressing/schema',
  team_read: '/pressing/equipe',
  messages_list: '/pressing/messages',
  messages_settings: '/pressing/messages',
  invoices_list: '/factures',
  team_work: '/pressing/travail',
  statement_delivery: '/pressing/releve',
};

/**
 * The questions proposed to a person: only what she may read, and first what goes with the screen
 * she is on. Four at most.
 */
export function suggestionsFor(permissions: string[], pathname: string): string[] {
  const may = (permission: string) => permissions.includes(permission);
  const topics: { permission: string; near: string; questions: (() => string)[] }[] = [
    { permission: 'cash:operate', near: '/argent/caisse', questions: [m.ask_suggestion_till] },
    { permission: 'workshop:operate', near: '/atelier', questions: [m.ask_suggestion_workshop] },
    { permission: 'invoices:read', near: '/factures', questions: [m.ask_suggestion_invoices] },
    { permission: 'money:read', near: '/argent', questions: [m.ask_suggestion_month, m.ask_suggestion_packs] },
    { permission: 'orders:read', near: '/depots', questions: [m.ask_suggestion_late, m.ask_suggestion_today] },
  ];
  const allowed = topics.filter((topic) => may(topic.permission));
  const here = allowed.filter((topic) => pathname.startsWith(topic.near));
  const rest = allowed.filter((topic) => !here.includes(topic));
  return [...here, ...rest].flatMap((topic) => topic.questions.map((question) => question())).slice(0, 4);
}

/** An alert as the day's screen says it, and the screen where it is dealt with. */
export function alertWords(alert: Alert): { title: string; meta: string; href: string } {
  const said: Record<AlertKind, () => { title: string; meta: string; href: string }> = {
    late: () => ({ title: m.today_late({ count: alert.count }), meta: m.today_late_meta(), href: '/depots?etape=open' }),
    due_soon: () => ({
      title: m.alert_due_soon({ count: alert.count }),
      meta: m.alert_due_soon_meta(),
      href: '/atelier',
    }),
    dormant: () => ({
      title: m.today_dormant({ count: alert.count }),
      meta: m.today_dormant_meta(),
      href: '/depots?etape=ready',
    }),
    till_gap: () => ({
      title: m.alert_till_gap({ count: alert.count, gap: formatSigned(alert.amount) }),
      meta: m.alert_till_gap_meta(),
      href: '/argent/caisse',
    }),
    discount_over_ceiling: () => ({
      title: m.alert_discount({ count: alert.count }),
      meta: m.alert_discount_meta(),
      href: '/depots',
    }),
    below_cost: () => ({
      title: m.alert_below_cost({ count: alert.count }),
      meta: m.alert_below_cost_meta(),
      href: '/argent/resultat',
    }),
    incident: () => ({
      title: m.alert_incident({ count: alert.count }),
      meta: m.alert_incident_meta(),
      href: '/atelier',
    }),
  };
  return said[alert.kind]();
}
