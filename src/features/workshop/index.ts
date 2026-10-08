// The workshop feature's only door: what the rest of the app may use. (The orders feature reaches
// `infrastructure/units` directly to open a deposit's units: this door depends on orders.)
export { workshopCapabilities, type WorkshopQueue } from './capabilities';
export { workshopMigrationSql } from './infrastructure/units';
export type { Incident, QueuedUnit, WorkUnit } from './infrastructure/units';
export type { IncidentKind, RouteStep } from './domain/work';
