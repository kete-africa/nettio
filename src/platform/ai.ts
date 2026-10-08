import {
  languageModel,
  ModelConfigError,
  modelConfigFromEnv,
  postgresBudgetStore,
  type BudgetStore,
} from '@kete/ai';
import { getPool } from './db';

type Model = ReturnType<typeof languageModel>;

let model: Model | null | undefined;
let store: BudgetStore | undefined;

/**
 * The model that hears, reads and words for Nettio — never computes (constitution II). From the
 * environment: NETTIO_AI_PROVIDER, NETTIO_AI_MODEL, NETTIO_AI_API_KEY. Without them « Demander »
 * is not connected, and says so: nothing is simulated.
 */
export function getModel(): Model | null {
  if (model !== undefined) return model;
  try {
    model = languageModel(modelConfigFromEnv('NETTIO_AI'));
  } catch (error) {
    if (!(error instanceof ModelConfigError)) throw error;
    model = null;
  }
  return model;
}

/** Tests: a scripted model, or none. */
export function useModel(next: Model | null | undefined): void {
  model = next;
}

/** Where each call's usage is recorded, and each organization's monthly budget checked. */
export function getBudgets(): BudgetStore {
  store ??= postgresBudgetStore(getPool());
  return store;
}
