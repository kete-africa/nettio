// The messaging feature's only door: what the rest of the app may use. (The orders and workshop
// features reach `infrastructure/outbox` directly to queue a message.)
export { messagingCapabilities } from './capabilities';
export { deliver, hear } from './delivery';
export { messagingPermissions } from './policies';
export { replyWords } from './reply-words';
export { messagingMigrationSql } from './infrastructure/outbox';
export type { Message, MessageStatus, MessageTemplate } from './infrastructure/outbox';
export type { MessageKind } from './domain/messages';
