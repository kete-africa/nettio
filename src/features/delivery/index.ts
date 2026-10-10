// The delivery feature's only door: what the rest of the app may use.
export { deliveryCapabilities, type DeliveryBoard } from './capabilities';
export { deliveryPermissions } from './policies';
export { checkPlan, isOpen, roundOf } from './domain/delivery';
export { deliveryMigrationSql } from './infrastructure/delivery.tables';
