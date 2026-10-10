import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';

// Everything a laundry recorded, in one reading (specs/030-standalone): its data is its own. The
// tables are named here, one by one — a new table is exported when someone adds it to this list.
export const EXPORTED_TABLES = [
  'settings',
  'sites',
  'staff',
  'role_permissions',
  'staff_messaging',
  'statement_delivery',
  'articles',
  'steps',
  'services',
  'service_steps',
  'prices',
  'packs',
  'customers',
  'customer_terms',
  'customer_prices',
  'orders',
  'order_items',
  'order_events',
  'payments',
  'cash_sessions',
  'cash_movements',
  'expenses',
  'owner_draws',
  'cost_sheets',
  'work_units',
  'work_events',
  'incidents',
  'message_templates',
  'messages',
  'invoice_settings',
  'invoices',
  'invoice_lines',
  'invoice_orders',
  'piece_rates',
  'clockings',
  'shifts',
  'approvals',
  'complaints',
  'manager_rules',
  'storage_fees',
  'abandon_notices',
  'subscriptions',
  'credit_entries',
  'quotes',
  'quote_lines',
  'delivery_zones',
  'deliveries',
  'transfers',
  'transfer_orders',
  'partner_points',
  'network_rules',
  'stock_items',
  'suppliers',
  'purchase_orders',
  'purchase_lines',
  'stock_moves',
  'supplier_payments',
] as const;

/**
 * The tables that are not exported, each with its reason. A table is in one list or the other:
 * a test fails when a migration creates one that is in neither.
 */
export const NOT_EXPORTED: Record<string, string> = {
  staff_codes: 'secrets: the hashes of personal codes',
  invoice_counters: 'technical: the next number of a series',
  quote_counters: 'technical: the next number of a series',
  transfer_counters: 'technical: the next number of a series',
  purchase_counters: 'technical: the next number of a series',
};

/** Never exported, whatever table carries them: a secret is not a record of the laundry. */
const SECRET_COLUMNS = new Set(['code_hash', 'link_token']);

export interface DataExport {
  product: string;
  organizationId: string;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
  /** Tables of the list this deployment does not have (an older database). */
  missing: string[];
}

/** What a screen may do with the laundry's data as a whole. Reading only — and the owner's alone. */
export const portabilityCapabilities = [
  defineCapability({
    name: 'data_export',
    description:
      'Everything the laundry recorded, table by table: customers, deposits, payments, invoices, expenses, team, stock. Secrets — personal codes, link tokens — are left out.',
    permission: 'data:export',
    autonomy: 1,
    classification: 'confidential',
    input: z.object({}),
    async run(_input, { db, organizationId }): Promise<DataExport> {
      const known = await db.query<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema = current_schema()`,
      );
      const present = new Set(known.rows.map((row) => row.table_name));
      const tables: DataExport['tables'] = {};
      const missing: string[] = [];
      for (const table of EXPORTED_TABLES) {
        if (!present.has(table)) {
          missing.push(table);
          continue;
        }
        // Row-level security keeps this to the laundry's own rows; the name comes from the list above.
        const { rows } = await db.query<Record<string, unknown>>(`select * from ${table}`);
        tables[table] = rows.map((row) =>
          Object.fromEntries(Object.entries(row).filter(([column]) => !SECRET_COLUMNS.has(column))),
        );
      }
      return { product: 'nettio', organizationId, exportedAt: new Date().toISOString(), tables, missing };
    },
  }),
];
