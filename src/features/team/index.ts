// The team feature's only door: what the rest of the app may use.
export { teamCapabilities } from './capabilities';
export { teamPermissions } from './policies';
export { monthPeriod, payOf, type PersonPay, type WorkLine } from './domain/pay';
export { hoursAndMinutes, minutesWithin, presenceOf, type PersonPresence } from './domain/presence';
export { presenceMigrationSql } from './infrastructure/presence.tables';
export { teamMigrationSql } from './infrastructure/team.tables';
