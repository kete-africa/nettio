// The assistant feature's only door: what the rest of the app may use.
export { askNettio, ASSISTANT, converse, SYSTEM, type AskOutcome, type AssistantEvent, type Turn } from './ask';
export { heardFromStaff, type AskWords } from './by-messaging';
export { assistantCapabilities } from './capabilities';
export { messagingLinkMigrationSql } from './infrastructure/messaging-link.tables';
export { assistantPermissions } from './policies';
export { dayStatement, type StatementFacts } from './domain/statement';
export { statementIsDue, type SendingOutcome } from './domain/sending';
export {
  linkStatementChat,
  organizationOfStatementToken,
  organizationsDue,
  statementDeliveryMigrationSql,
  STATEMENT_TOKEN,
} from './infrastructure/delivery.tables';
export { sendDueStatement, sendStatement, statementOf, type SendingPorts } from './sending';
