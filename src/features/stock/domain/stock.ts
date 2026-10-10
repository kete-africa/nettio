import { RuleError } from '@/lib/rule-error';

// Stock and purchasing (specs/029-stock): what the laundry holds of each consumable, what it
// ordered and received, what it owes a supplier, what it used — against what its cost sheets
// planned. Pure rules; nothing here reads a clock or a database.

export const moveKinds = ['reception', 'use', 'count', 'loss'] as const;
export type MoveKind = (typeof moveKinds)[number];

/** Three decimals: a quantity is a weight, a volume, or a count. */
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** What is held: every movement added up — receptions in, uses and losses out, counts as gaps. */
export const levelOf = (moves: { quantity: number }[]): number =>
  round3(moves.reduce((sum, move) => sum + move.quantity, 0));

/**
 * What a unit cost on average: what was received, at what it cost, to the franc. Null while
 * nothing was received with a cost — a value is then not guessed.
 */
export function averageCost(receptions: { quantity: number; unitCost: number | null }[]): number | null {
  const priced = receptions.filter((move) => move.unitCost !== null && move.quantity > 0);
  const quantity = priced.reduce((sum, move) => sum + move.quantity, 0);
  if (quantity <= 0) return null;
  return Math.round(priced.reduce((sum, move) => sum + move.quantity * (move.unitCost ?? 0), 0) / quantity);
}

export type StockState = 'ok' | 'low' | 'out';

/** Out when nothing is left; low at or under the laundry's own threshold. */
export function stateOf(level: number, threshold: number): StockState {
  if (level <= 0) return 'out';
  return threshold > 0 && level <= threshold ? 'low' : 'ok';
}

/** What leaves the shelf is on it: more than the level means the count is wrong — said, not hidden. */
export function checkUse(quantity: number, level: number): void {
  if (!(quantity > 0)) throw new RuleError('quantity_invalid');
  if (quantity > level) throw new RuleError('stock_insufficient', { amount: Math.max(0, level) });
}

/** An inventory: what was counted against what the movements said — the gap, kept as it is. */
export const countGap = (counted: number, level: number): number => round3(counted - level);

/** « BC-0042 »: a purchase order's number. */
export const purchaseNumber = (seq: number): string => `BC-${String(seq).padStart(4, '0')}`;

export const purchaseStatuses = ['ordered', 'received', 'cancelled'] as const;
export type PurchaseStatus = (typeof purchaseStatuses)[number];

/** What an order is worth: each line's quantity at its unit cost, to the franc. */
export const purchaseTotal = (lines: { quantity: number; unitCost: number }[]): number =>
  lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitCost), 0);

/**
 * A reception: what really arrived, line by line — never more lines than were ordered, a quantity
 * that may be less (or more) than ordered, at the cost the supplier really charged.
 */
export function checkReception(
  status: PurchaseStatus,
  ordered: string[],
  received: { lineId: string; quantity: number; unitCost: number }[],
): void {
  if (status !== 'ordered') throw new RuleError('purchase_not_open');
  const known = new Set(ordered);
  if (received.some((line) => !known.has(line.lineId))) throw new RuleError('not_found');
  if (new Set(received.map((line) => line.lineId)).size !== received.length) throw new RuleError('invalid_input');
  if (received.some((line) => line.quantity < 0 || !Number.isInteger(line.unitCost) || line.unitCost < 0)) {
    throw new RuleError('quantity_invalid');
  }
  if (!received.some((line) => line.quantity > 0)) throw new RuleError('reception_empty');
}

/** What the laundry owes a supplier: what it received, minus what it paid. */
export const debtOf = (received: number, paid: number): number => received - paid;

export function checkSupplierPayment(amount: number, debt: number): void {
  if (!Number.isInteger(amount) || amount <= 0) throw new RuleError('amount_invalid');
  if (amount > debt) throw new RuleError('payment_above_debt', { amount: Math.max(0, debt) });
}

/**
 * What the cost sheets planned in consumables for the volume treated, against what really left
 * the shelves. A gap points to a wrong sheet, to waste, or to uses nobody recorded.
 */
export function consumption(input: {
  lines: { serviceId: string; articleId: string | null; quantity: number }[];
  /** The consumables a sheet plans for one unit, by « service|article ». */
  planned: Map<string, number>;
  /** The value of what was used: quantity at average cost. */
  used: number;
}): { planned: number; used: number; gap: number; coverage: number } {
  let planned = 0;
  let covered = 0;
  let units = 0;
  for (const line of input.lines) {
    units += line.quantity;
    const sheet = input.planned.get(`${line.serviceId}|${line.articleId ?? ''}`);
    if (sheet === undefined) continue;
    planned += sheet * line.quantity;
    covered += line.quantity;
  }
  const rounded = Math.round(planned);
  return { planned: rounded, used: input.used, gap: input.used - rounded, coverage: units > 0 ? covered / units : 0 };
}
