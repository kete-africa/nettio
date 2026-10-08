// The money feature's only door: what the rest of the app may use.
export { moneyCapabilities, monthFigures } from './capabilities';
export { guardRail, tillFor } from './commands';
export { moneyPermissions } from './policies';
export { checkCashOut } from './domain/till';
export { attachPayment, flagBelowCost, moneyMigrationSql } from './infrastructure/money.tables';
export type { CashSession, Expense, OwnerDraw, PaidFrom } from './money.record';
export type { BreakEven, Confidence, PackMargin } from './domain/costs';
