import { aiCostMigrationSql, aiMigrationSql } from '@kete/ai';
import { commandsDelegationMigrationSql, commandsMigrationSql } from '@kete/commands';
import { draftsMigrationSql } from '@kete/drafts';
import { feedbackMigrationSql } from '@kete/feedback';
import { outboxMigrationSql } from '@kete/sdk';
import { messagingLinkMigrationSql, statementDeliveryMigrationSql } from '@/features/assistant';
import { businessMigrationSql } from '@/features/business';
import { catalogMigrationSql } from '@/features/catalog';
import { customersMigrationSql } from '@/features/customers';
import { invoicesMigrationSql } from '@/features/invoices';
import { managerMigrationSql } from '@/features/manager';
import { messagingMigrationSql } from '@/features/messaging';
import { moneyMigrationSql } from '@/features/money';
import { ordersMigrationSql } from '@/features/orders';
import { presenceMigrationSql, teamMigrationSql } from '@/features/team';
import { workshopMigrationSql } from '@/features/workshop';

export interface MigrationContext {
  schema: string;
  appRole: string;
  ownerRole: string;
}

export interface Migration {
  name: string;
  sql(context: MigrationContext): string;
}

/**
 * The app's migrations, in order; never edit one that ran. Every table comes with its row-level
 * security in the same migration (constitution V).
 */
export const migrations: Migration[] = [
  {
    // The tables kete-core provides: command journal, drafts, event outbox, feedback.
    name: '0000_kete',
    sql: (context) =>
      [
        commandsMigrationSql(context),
        draftsMigrationSql(context),
        outboxMigrationSql(context),
        feedbackMigrationSql(context),
      ].join('\n'),
  },
  // The journal keeps the chain of agents behind each gesture (doctrine D-039).
  { name: '0001_kete_delegation', sql: (context) => commandsDelegationMigrationSql(context) },
  // The business events to the center, in their own outbox (kete-core spec 049).
  {
    name: '0002_kete_center_outbox',
    sql: (context) => outboxMigrationSql({ ...context, name: 'kete_center_outbox' }),
  },
  // The laundry: its settings, sites, team and rights (specs/001-foundation).
  { name: '0003_business', sql: (context) => businessMigrationSql(context) },
  // Its catalogue: articles, steps, services and routes, prices, packs.
  { name: '0004_catalog', sql: (context) => catalogMigrationSql(context) },
  // The counter (specs/002-counter): customers, deposits with their real content, payments.
  { name: '0005_customers', sql: (context) => customersMigrationSql(context) },
  { name: '0006_orders', sql: (context) => ordersMigrationSql(context) },
  // The money (specs/003-money-day, 004-earn): tills, expenses, draws, cost sheets.
  { name: '0007_money', sql: (context) => moneyMigrationSql(context) },
  // The workshop (specs/005-workshop): work units, their steps, incidents.
  { name: '0008_workshop', sql: (context) => workshopMigrationSql(context) },
  // The customer's messaging (specs/006-messaging): templates, messages, the senders' lookup.
  { name: '0009_messaging', sql: (context) => messagingMigrationSql(context) },
  // Kete Intelligence (specs/007-intelligence): each model call's usage, each organization's budget.
  {
    name: '0010_kete_ai',
    sql: (context) => [aiMigrationSql(context), aiCostMigrationSql(context)].join('\n'),
  },
  // Two lines written by one gesture share its transaction's time: a history is dated by the
  // clock instead, so that it always reads in the order things were done (found by the CI).
  {
    name: '0011_history_order',
    sql: ({ schema }) =>
      [
        `alter table ${schema}.order_events alter column at set default clock_timestamp();`,
        `alter table ${schema}.work_events alter column at set default clock_timestamp();`,
        `alter table ${schema}.messages alter column created_at set default clock_timestamp();`,
      ].join('\n'),
  },
  // The evening statement sent by itself (specs/013-statement-sent): where it leaves to.
  { name: '0012_statement_delivery', sql: (context) => statementDeliveryMigrationSql(context) },
  // The team's work and pay (specs/015-team-pay): piece rates, and who a wage was handed to.
  { name: '0013_team_pay', sql: (context) => teamMigrationSql(context) },
  // Invoices and credit notes (specs/019-invoices): written once, numbered without a gap.
  { name: '0014_invoices', sql: (context) => invoicesMigrationSql(context) },
  // Asking Nettio from one's own WhatsApp or Telegram (specs/023-ask-by-messaging).
  { name: '0015_staff_messaging', sql: (context) => messagingLinkMigrationSql(context) },
  // Who is at work (specs/024-presence): each person clocks in and out herself.
  { name: '0016_presence', sql: (context) => presenceMigrationSql(context) },
  // What lets a site run without its owner (specs/025-manager): schedules, approvals, complaints,
  // unclaimed deposits, personal codes — and a storage fee says its name on an invoice.
  {
    name: '0017_manager',
    sql: (context) =>
      [
        managerMigrationSql(context),
        `alter table ${context.schema}.orders add column storage_amount integer not null default 0 check (storage_amount >= 0);`,
        `alter table ${context.schema}.invoice_lines drop constraint invoice_lines_kind_check;`,
        `alter table ${context.schema}.invoice_lines add constraint invoice_lines_kind_check
           check (kind in ('item', 'pack', 'express', 'discount', 'order', 'storage'));`,
      ].join('\n'),
  },
];
