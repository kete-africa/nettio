// Knowing whether I earn (docs/product/model.md, « Les coûts »). Every figure here is a pure
// function, tested alone (constitution II): a model computes none of them. A couple with no cost
// sheet has no cost — Nettio says « never measured » and never invents one.

/** What an article costs to treat for a service — or a kilo, for a per-kilo service. */
export interface CostSheet {
  serviceId: string;
  /** Null for a per-kilo service: the sheet of one kilo. */
  articleId: string | null;
  laborMinutes: number;
  consumablesCost: number;
  machineCost: number;
  /** Measured at the laundry (weighed, timed), or only estimated. */
  measured: boolean;
}

export interface CostSettings {
  laborIsVariable: boolean;
  laborMinuteCost: number;
}

/** A line of a deposit as the costs need it. */
export interface CostedLine {
  serviceId: string;
  articleId: string | null;
  /** Pieces, or kilos. */
  quantity: number;
  /** What the pack covered of it; 0 without a pack. */
  covered: number;
}

export const sheetKey = (serviceId: string, articleId: string | null): string =>
  `${serviceId}|${articleId ?? ''}`;

export const indexSheets = (sheets: CostSheet[]): Map<string, CostSheet> =>
  new Map(sheets.map((sheet) => [sheetKey(sheet.serviceId, sheet.articleId), sheet]));

/**
 * The variable cost of one unit: its consumables and its machine — and its minutes of work when
 * the workshop is paid by the piece.
 */
export function variableCost(sheet: CostSheet, settings: CostSettings): number {
  const labor = settings.laborIsVariable ? sheet.laborMinutes * settings.laborMinuteCost : 0;
  return sheet.consumablesCost + sheet.machineCost + labor;
}

/**
 * How the fixed charges of a month are spread: per minute of work of the units treated in the
 * month, or per unit when no minute is known. Units with no sheet weigh nothing: they are named
 * apart, never guessed.
 */
export interface FixedSpread {
  perMinute: number;
  perUnit: number;
  /** Units that carry a share. */
  units: number;
  minutes: number;
}

export function spreadFixed(
  fixedCharges: number,
  lines: CostedLine[],
  sheets: Map<string, CostSheet>,
): FixedSpread {
  let units = 0;
  let minutes = 0;
  for (const line of lines) {
    const sheet = sheets.get(sheetKey(line.serviceId, line.articleId));
    if (!sheet) continue;
    units += line.quantity;
    minutes += line.quantity * sheet.laborMinutes;
  }
  if (minutes > 0) return { perMinute: fixedCharges / minutes, perUnit: 0, units, minutes };
  return { perMinute: 0, perUnit: units > 0 ? fixedCharges / units : 0, units, minutes };
}

/** The share of the month's fixed charges one unit carries. */
export const fixedShare = (sheet: CostSheet, spread: FixedSpread): number =>
  spread.minutes > 0 ? sheet.laborMinutes * spread.perMinute : spread.perUnit;

/** The complete cost of one unit: its variable cost and its share of the fixed charges. */
export const completeCost = (sheet: CostSheet, settings: CostSettings, spread: FixedSpread): number =>
  variableCost(sheet, settings) + fixedShare(sheet, spread);

export interface ContentCost {
  variable: number;
  complete: number;
  /** Units the cost rests on. */
  costed: number;
  /** Units with no sheet: « never measured ». When above 0, the cost is not the whole cost. */
  uncosted: number;
  /** Units whose sheet is only estimated. */
  estimated: number;
}

/**
 * What a content costs. `part` chooses what of each line counts: all of it (a deposit), or what
 * the pack covered (a pack).
 */
export function contentCost(
  lines: CostedLine[],
  sheets: Map<string, CostSheet>,
  settings: CostSettings,
  spread: FixedSpread,
  part: 'all' | 'covered' = 'all',
): ContentCost {
  const cost: ContentCost = { variable: 0, complete: 0, costed: 0, uncosted: 0, estimated: 0 };
  for (const line of lines) {
    const quantity = part === 'all' ? line.quantity : line.covered;
    if (quantity <= 0) continue;
    const sheet = sheets.get(sheetKey(line.serviceId, line.articleId));
    if (!sheet) {
      cost.uncosted += quantity;
      continue;
    }
    cost.costed += quantity;
    if (!sheet.measured) cost.estimated += quantity;
    cost.variable += quantity * variableCost(sheet, settings);
    cost.complete += quantity * completeCost(sheet, settings, spread);
  }
  return cost;
}

/** How far a figure rests on measures taken at the laundry. */
export type Confidence = 'measured' | 'estimated' | 'partial' | 'never';

export function confidenceOf(cost: Pick<ContentCost, 'costed' | 'uncosted' | 'estimated'>): Confidence {
  if (cost.costed === 0) return 'never';
  if (cost.uncosted > 0) return 'partial';
  return cost.estimated > 0 ? 'estimated' : 'measured';
}

export interface PackSale {
  packName: string;
  packPrice: number;
  lines: CostedLine[];
}

export interface PackMargin {
  packName: string;
  sold: number;
  /** The average price it was sold at. */
  price: number;
  /** The average complete cost of its real content, on the sales that could be costed. */
  cost: number | null;
  /** Price minus cost: what one sale of it earns, on average. Null when nothing could be costed. */
  margin: number | null;
  /** The average variable cost of its content. */
  variableCost: number | null;
  confidence: Confidence;
  /** Sales whose whole content had a sheet. */
  costedSales: number;
}

/**
 * What each pack really earns over a period: its price minus the complete cost of its real
 * content. A sale with an article never measured is left out of the average and counted apart;
 * a pack sold at a loss is shown as it is — a choice Nettio does not judge (constitution III).
 */
export function packMargins(
  sales: PackSale[],
  sheets: Map<string, CostSheet>,
  settings: CostSettings,
  spread: FixedSpread,
): PackMargin[] {
  const byPack = new Map<string, PackSale[]>();
  for (const sale of sales) {
    byPack.set(sale.packName, [...(byPack.get(sale.packName) ?? []), sale]);
  }
  return [...byPack.entries()]
    .map(([packName, list]) => {
      let complete = 0;
      let variable = 0;
      let revenue = 0;
      let costedSales = 0;
      let anyEstimated = false;
      let anyCosted = false;
      for (const sale of list) {
        const cost = contentCost(sale.lines, sheets, settings, spread, 'covered');
        if (cost.costed > 0) anyCosted = true;
        if (cost.uncosted > 0 || cost.costed === 0) continue;
        costedSales += 1;
        complete += cost.complete;
        variable += cost.variable;
        revenue += sale.packPrice;
        if (cost.estimated > 0) anyEstimated = true;
      }
      const price = list.reduce((sum, sale) => sum + sale.packPrice, 0) / list.length;
      const confidence: Confidence =
        costedSales === 0
          ? anyCosted
            ? 'partial'
            : 'never'
          : costedSales < list.length
            ? 'partial'
            : anyEstimated
              ? 'estimated'
              : 'measured';
      return {
        packName,
        sold: list.length,
        price,
        cost: costedSales > 0 ? complete / costedSales : null,
        margin: costedSales > 0 ? (revenue - complete) / costedSales : null,
        variableCost: costedSales > 0 ? variable / costedSales : null,
        confidence,
        costedSales,
      };
    })
    .sort((a, b) => b.sold - a.sold || a.packName.localeCompare(b.packName));
}

/**
 * The counter's guard-rail: whether a deposit's total falls under the variable cost of its
 * content. Only said when every line has a sheet; it never blocks.
 */
export function belowVariableCost(
  total: number,
  lines: CostedLine[],
  sheets: Map<string, CostSheet>,
  settings: CostSettings,
): { below: boolean; variableCost: number } | null {
  const none: FixedSpread = { perMinute: 0, perUnit: 0, units: 0, minutes: 0 };
  const cost = contentCost(lines, sheets, settings, none);
  if (cost.uncosted > 0 || cost.costed === 0) return null;
  return { below: total < cost.variable, variableCost: cost.variable };
}

export interface BreakEven {
  /** Units of the month: pieces and kilos. */
  units: number;
  /** What a unit brings in on average: cashed ÷ units. */
  revenuePerUnit: number;
  /** The average variable cost of a unit, on the units that have a sheet. */
  variablePerUnit: number;
  /** What a unit leaves to pay the fixed charges. */
  contribution: number;
  /** Units to treat in the month to cover the fixed charges; null when it cannot be reached. */
  unitsPerMonth: number | null;
  unitsPerDay: number | null;
  /** The share of the month's units the variable cost rests on, 0 to 1. */
  coverage: number;
  /** Why there is no number, when there is none. */
  reason: 'no_activity' | 'no_sheet' | 'no_contribution' | null;
}

/**
 * Break-even: fixed charges ÷ the average contribution of a unit. When a unit leaves nothing — or
 * costs more than it brings — there is no number to show: Nettio says so in words.
 */
export function breakEven(input: {
  cashed: number;
  fixedCharges: number;
  workingDays: number;
  lines: CostedLine[];
  sheets: Map<string, CostSheet>;
  settings: CostSettings;
}): BreakEven {
  const units = input.lines.reduce((sum, line) => sum + line.quantity, 0);
  const none: FixedSpread = { perMinute: 0, perUnit: 0, units: 0, minutes: 0 };
  const cost = contentCost(input.lines, input.sheets, input.settings, none);
  const revenuePerUnit = units > 0 ? input.cashed / units : 0;
  const variablePerUnit = cost.costed > 0 ? cost.variable / cost.costed : 0;
  const contribution = revenuePerUnit - variablePerUnit;
  const reason =
    units === 0
      ? 'no_activity'
      : cost.costed === 0
        ? 'no_sheet'
        : contribution <= 0
          ? 'no_contribution'
          : null;
  const unitsPerMonth = reason === null ? input.fixedCharges / contribution : null;
  return {
    units,
    revenuePerUnit,
    variablePerUnit,
    contribution,
    unitsPerMonth,
    unitsPerDay: unitsPerMonth === null ? null : unitsPerMonth / Math.max(1, input.workingDays),
    coverage: units > 0 ? cost.costed / units : 0,
    reason,
  };
}

/** The result of a period, on cash received: what the owner can check in his till. */
export function periodResult(input: {
  cashed: number;
  fixedCharges: number;
  variableCharges: number;
  draws: number;
}): { cashed: number; charges: number; result: number; draws: number; left: number; rate: number } {
  const charges = input.fixedCharges + input.variableCharges;
  const result = input.cashed - charges;
  return {
    cashed: input.cashed,
    charges,
    result,
    draws: input.draws,
    left: result - input.draws,
    rate: input.cashed > 0 ? (result * 100) / input.cashed : 0,
  };
}

/**
 * Planned against real: what the sheets planned in variable costs for the volume treated, against
 * the real variable expenses of the period. The gap points to a wrong sheet or to waste.
 */
export function reconciliation(input: {
  lines: CostedLine[];
  sheets: Map<string, CostSheet>;
  settings: CostSettings;
  variableCharges: number;
}): { planned: number; real: number; gap: number; coverage: number } {
  const none: FixedSpread = { perMinute: 0, perUnit: 0, units: 0, minutes: 0 };
  const cost = contentCost(input.lines, input.sheets, input.settings, none);
  const units = cost.costed + cost.uncosted;
  return {
    planned: cost.variable,
    real: input.variableCharges,
    gap: input.variableCharges - cost.variable,
    coverage: units > 0 ? cost.costed / units : 0,
  };
}
