// The invoices feature's only door: what the rest of the app may use.
export { invoiceCapabilities } from './capabilities';
export { invoicePermissions } from './policies';
export {
  allocate,
  dueOn,
  linesOf,
  numberOf,
  statusOf,
  vatInside,
  type InvoiceLine,
  type InvoiceStatus,
} from './domain/invoice';
export { invoicesMigrationSql } from './infrastructure/invoices.tables';
export type { CustomerAccount, Invoice, InvoiceSettings, InvoiceSummary } from './invoice.record';
