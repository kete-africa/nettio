// The catalogue feature's only door: what the rest of the app may use.
export { catalogCapabilities } from './capabilities';
export { catalogPermissions } from './policies';
export { catalogGaps, packAdmits, priceOf } from './domain/catalog';
export {
  catalogMigrationSql,
  readCatalog,
  seedCatalog,
} from './infrastructure/catalog.tables';
export type {
  Article,
  Catalog,
  Nature,
  Pack,
  PackMode,
  Price,
  Pricing,
  Service,
  Step,
} from './catalog.record';
