// The customers feature's only door: what the rest of the app may use.
export { customerCapabilities } from './capabilities';
export { customerAt } from './commands';
export { customerPermissions } from './policies';
export { formatPhone, normalizePhone } from './domain/phone';
export { customersMigrationSql, findCustomer } from './infrastructure/customers.table';
export type { Customer, CustomerChannel, CustomerKind } from './customer.record';
