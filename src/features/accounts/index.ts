// The accounts feature's only door: what the rest of the app may use.
export { accountCapabilities, type AccountView } from './capabilities';
export { accountPermissions } from './policies';
export { balanceOf, monthBounds, periodOf, quoteState, withCustomerPrices } from './domain/accounts';
export { accountsMigrationSql } from './infrastructure/accounts.tables';
