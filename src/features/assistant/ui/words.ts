import * as m from '@/paraglide/messages.js';

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
};
