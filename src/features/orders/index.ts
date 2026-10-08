// The orders feature's only door: what the rest of the app may use.
export { dayBounds, orderCapabilities } from './capabilities';
export { orderEvents } from './events';
export { orderPermissions } from './policies';
export { isClosed, orderStatuses, paymentMethods } from './domain/order';
export { priceOrder } from './domain/pricing';
export { ordersMigrationSql } from './infrastructure/orders.tables';
export type { OrderStatus, PaymentKind, PaymentMethod } from './domain/order';
export type { OrderPrice, PricedLine, PricingPack } from './domain/pricing';
export type { DaySummary } from './infrastructure/orders.tables';
export type { Order, OrderEvent, OrderItem, OrderSummary, Payment } from './order.record';
