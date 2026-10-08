import { createCapabilityRegistry, createDatasetRegistry } from '@kete/capabilities';
import { taskCapabilities, taskDatasets } from '@/features/tasks';
import { transaction } from './db';
import { holds } from './rights';

/**
 * Every gesture of the app, the same for its screens, its MCP endpoint and its agents: same
 * rights, same journal, same autonomy rules (@kete/capabilities).
 */
export const registry = createCapabilityRegistry([...taskCapabilities], {
  authorize: async (_caller, permission) => holds(permission),
  transaction,
});

/**
 * What the app exposes to dashboards, the assistant and other apps (kete-core spec 045): data sets
 * read with the same rights and organization as its capabilities.
 */
export const datasets = createDatasetRegistry([...taskDatasets], {
  authorize: async (_caller, permission) => holds(permission),
  transaction,
});
