import {
  languageModel,
  ModelConfigError,
  modelConfigFromEnv,
  postgresBudgetStore,
  transcriptionModel,
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

type Transcriber = { provider: string; modelId: string } & Exclude<
  ReturnType<typeof transcriptionModel>,
  string
>;

let transcriber: Transcriber | null | undefined;

/**
 * The model that hears a dictated deposit (NETTIO_AI_TRANSCRIPTION_MODEL, with the same provider
 * and key as the language model). Without it, a deposit can still be typed in a sentence.
 */
export function getTranscriber(): Transcriber | null {
  if (transcriber !== undefined) return transcriber;
  const name = process.env.NETTIO_AI_TRANSCRIPTION_MODEL;
  try {
    const config = modelConfigFromEnv('NETTIO_AI');
    const made = name ? transcriptionModel({ ...config, model: name }) : null;
    transcriber = made && typeof made !== 'string' ? (made as Transcriber) : null;
  } catch (error) {
    if (!(error instanceof ModelConfigError)) throw error;
    transcriber = null;
  }
  return transcriber;
}

/** Tests: a scripted transcriber, or none. */
export function useTranscriber(next: Transcriber | null | undefined): void {
  transcriber = next;
}

/** Where each call's usage is recorded, and each organization's monthly budget checked. */
export function getBudgets(): BudgetStore {
  store ??= postgresBudgetStore(getPool());
  return store;
}
