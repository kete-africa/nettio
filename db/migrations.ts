import { commandsDelegationMigrationSql, commandsMigrationSql } from '@kete/commands';
import { draftsMigrationSql } from '@kete/drafts';
import { feedbackMigrationSql } from '@kete/feedback';
import { outboxMigrationSql } from '@kete/sdk';
import { businessMigrationSql } from '@/features/business';
import { catalogMigrationSql } from '@/features/catalog';
import { customersMigrationSql } from '@/features/customers';
import { moneyMigrationSql } from '@/features/money';
import { ordersMigrationSql } from '@/features/orders';

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
];
