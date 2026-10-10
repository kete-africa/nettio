// The network feature's only door: what the rest of the app may use.
export { networkCapabilities, type NetworkResult, type TransfersBoard } from './capabilities';
export { networkPermissions } from './policies';
export { allocate, commissionOf, nextStop, placeOf, siteResults } from './domain/network';
export { networkMigrationSql } from './infrastructure/network.tables';
