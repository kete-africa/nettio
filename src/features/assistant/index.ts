// The assistant feature's only door: what the rest of the app may use.
export { askNettio, ASSISTANT, SYSTEM, type AskOutcome } from './ask';
export { assistantCapabilities } from './capabilities';
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
