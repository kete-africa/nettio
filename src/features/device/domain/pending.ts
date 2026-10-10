// A counter that loses its connection (specs/031-device): a deposit is kept on the device and
// sent when the network returns — once, thanks to its key. Pure rules on the waiting list.

export interface PendingDeposit {
  /** The gesture's key: sent twice, it runs once. */
  key: string;
  /** What the counter was saving, exactly as it would have been sent. */
  order: Record<string, unknown>;
  /** What the clerk reads while it waits. */
  customer: string;
  total: number;
  savedAt: string;
  /** Why the server refused it, once it could be reached: it then waits for a person. */
  error?: string;
}

/** Adds a deposit to the list, once: the same key never waits twice. */
export function withPending(list: PendingDeposit[], deposit: PendingDeposit): PendingDeposit[] {
  return list.some((each) => each.key === deposit.key) ? list : [...list, deposit];
}

export const withoutPending = (list: PendingDeposit[], key: string): PendingDeposit[] =>
  list.filter((each) => each.key !== key);

export const withError = (list: PendingDeposit[], key: string, error: string): PendingDeposit[] =>
  list.map((each) => (each.key === key ? { ...each, error } : each));

/** What is still worth trying by itself: what no rule refused. */
export const toRetry = (list: PendingDeposit[]): PendingDeposit[] => list.filter((each) => !each.error);

/**
 * Whether a failure is the network's — the request never reached Nettio — and not Nettio's
 * answer. Only then is a deposit kept to be sent later: a refusal is said at once.
 */
export function isNetworkFailure(error: unknown, online: boolean): boolean {
  if (!online) return true;
  if (!(error instanceof Error)) return false;
  return error.name === 'TypeError' || /failed to fetch|networkerror|load failed|network request failed/i.test(error.message);
}

/** What is read back from the device: anything that is not a list of deposits is no list at all. */
export function parsePending(raw: string | null): PendingDeposit[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (each): each is PendingDeposit =>
        typeof each === 'object' &&
        each !== null &&
        typeof (each as PendingDeposit).key === 'string' &&
        typeof (each as PendingDeposit).order === 'object' &&
        (each as PendingDeposit).order !== null &&
        typeof (each as PendingDeposit).customer === 'string' &&
        typeof (each as PendingDeposit).total === 'number' &&
        typeof (each as PendingDeposit).savedAt === 'string',
    );
  } catch {
    return [];
  }
}
