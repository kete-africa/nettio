import { RuleError } from '@/lib/rule-error';

// What a deposit costs (docs/product/model.md, « Le dépôt »). One pure function, used by the
// server when the deposit is received and by the screen while it is typed: the two never differ.
// Amounts are whole francs; kilos have decimals.

export interface PricedLine {
  serviceId: string;
  /** Null for a per-kilo line. */
  articleId: string | null;
  pricing: 'per_piece' | 'per_kg';
  /** Pieces, or kilos. */
  quantity: number;
  /** For one piece, or one kilo. */
  unitPrice: number;
}

export interface PricingPack {
  mode: 'pieces' | 'weight';
  quota: number;
  price: number;
  /** The services it admits; none named means all of its mode. */
  serviceIds: string[];
}

export interface LinePrice {
  /** Its normal price: quantity × unit price. */
  amount: number;
  /** What the pack covers of it, in pieces or kilos. */
  covered: number;
  /** What is still due for it once the pack has covered its part. */
  due: number;
}

export interface OrderPrice {
  lines: LinePrice[];
  /** The normal price of everything, as if there were no pack. */
  subtotal: number;
  /** The pack's price, 0 without a pack. */
  packPrice: number;
  /** How much of its quota the pack used, in pieces or kilos. */
  packUsed: number;
  /** The normal price of what the pack covered: what the customer would have paid without it. */
  coveredValue: number;
  /** What is due beyond the pack: pieces above the quota, lines it does not admit. */
  supplement: number;
  express: number;
  discount: number;
  total: number;
}

const round = (value: number): number => Math.round(value);
/** Kilos to the gram: sums of decimals stay exact enough to compare. */
const grams = (value: number): number => Math.round(value * 1000) / 1000;

function admits(pack: PricingPack, line: PricedLine): boolean {
  const wanted = pack.mode === 'pieces' ? 'per_piece' : 'per_kg';
  if (line.pricing !== wanted) return false;
  return pack.serviceIds.length === 0 || pack.serviceIds.includes(line.serviceId);
}

/**
 * Prices a deposit.
 * 1. Each line has its normal price.
 * 2. A pack covers the lines it admits up to its quota, the most expensive first: the customer
 *    keeps the largest advantage. What it does not cover is due at its normal price.
 * 3. Express adds a percentage of the total before discount.
 * 4. A discount is deducted, and never makes the total negative.
 */
export function priceOrder(input: {
  lines: PricedLine[];
  pack?: PricingPack | null;
  /** 0 when the deposit is not express. */
  expressPercent?: number;
  discount?: number;
}): OrderPrice {
  for (const line of input.lines) {
    if (!(line.quantity > 0)) throw new RuleError('quantity_invalid');
    if (line.pricing === 'per_piece' && !Number.isInteger(line.quantity)) {
      throw new RuleError('quantity_invalid');
    }
    if (!Number.isInteger(line.unitPrice) || line.unitPrice < 0) {
      throw new RuleError('price_invalid');
    }
  }
  const amounts = input.lines.map((line) => round(line.quantity * line.unitPrice));
  const covered = input.lines.map(() => 0);
  const pack = input.pack ?? null;
  let left = pack ? pack.quota : 0;
  if (pack) {
    // The most expensive first; at the same price, in the order they were entered.
    const order = input.lines
      .map((line, index) => ({ line, index }))
      .filter(({ line }) => admits(pack, line))
      .sort((a, b) => b.line.unitPrice - a.line.unitPrice || a.index - b.index);
    for (const { line, index } of order) {
      if (left <= 0) break;
      const take = Math.min(line.quantity, left);
      covered[index] = grams(take);
      left = grams(left - take);
    }
  }
  const lines = input.lines.map((line, index) => {
    const part = covered[index] ?? 0;
    const amount = amounts[index] ?? 0;
    // A fully covered line owes nothing, whatever the rounding of its kilos.
    const due = part >= line.quantity ? 0 : round((line.quantity - part) * line.unitPrice);
    return { amount, covered: part, due };
  });
  const subtotal = amounts.reduce((sum, amount) => sum + amount, 0);
  const supplement = lines.reduce((sum, line) => sum + line.due, 0);
  const packPrice = pack ? pack.price : 0;
  const base = pack ? packPrice + supplement : subtotal;
  const express = round((base * Math.max(0, input.expressPercent ?? 0)) / 100);
  const wanted = Math.max(0, round(input.discount ?? 0));
  const discount = Math.min(wanted, base + express);
  return {
    lines,
    subtotal,
    packPrice,
    packUsed: pack ? grams(pack.quota - left) : 0,
    coveredValue: pack ? subtotal - supplement : 0,
    supplement: pack ? supplement : 0,
    express,
    discount,
    total: base + express - discount,
  };
}

/** The share of a discount in what it is deducted from, in percent. */
export function discountPercent(price: Pick<OrderPrice, 'discount' | 'total'>): number {
  const before = price.total + price.discount;
  return before > 0 ? (price.discount * 100) / before : 0;
}

/**
 * Whether a discount may be granted by this person: within the ceiling anyone may, above it only
 * who holds the right. It always needs a reason.
 */
export function checkDiscount(
  price: Pick<OrderPrice, 'discount' | 'total'>,
  input: { reason: string | undefined; ceilingPercent: number; mayExceed: boolean },
): void {
  if (price.discount <= 0) return;
  if (!input.reason?.trim()) throw new RuleError('discount_needs_reason');
  if (!input.mayExceed && discountPercent(price) > input.ceilingPercent + 1e-9) {
    throw new RuleError('discount_above_ceiling', { ceiling: input.ceilingPercent });
  }
}
