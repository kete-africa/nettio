// The stock feature's only door: what the rest of the app may use.
export { stockCapabilities, type StockBoard, type StockConsumption } from './capabilities';
export { stockPermissions } from './policies';
export { averageCost, consumption, levelOf, stateOf } from './domain/stock';
export { stockMigrationSql } from './infrastructure/stock.tables';
