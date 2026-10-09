// What deserves a look today (specs/022-alerts): computed by code from the day's facts, never
// guessed. Pure: each alert is a fact with its count or its amount, in a fixed order — what is
// already wrong first, then what is about to be.

export const alertKinds = [
  'late',
  'till_gap',
  'discount_over_ceiling',
  'below_cost',
  'incident',
  'due_soon',
  'dormant',
] as const;
export type AlertKind = (typeof alertKinds)[number];

export interface Alert {
  kind: AlertKind;
  /** How many deposits, tills or incidents. */
  count: number;
  /** For a till's gap: what is missing (negative) or in excess, in all. */
  amount: number;
}

/** The day's facts an alert may rest on; a fact the person may not read is left out (undefined). */
export interface AlertFacts {
  /** Promised before now and not ready. */
  late?: number;
  /** Promised within the next 24 hours and not ready. */
  dueSoon?: number;
  /** Ready for longer than the laundry's delay. */
  dormant?: number;
  /** Deposits of today with a discount above the laundry's ceiling. */
  discountsOverCeiling?: number;
  /** The gaps of the tills closed today, one per till. */
  tillGaps?: number[];
  /** Deposits of the month sold under the variable cost of their content. */
  belowCost?: number;
  openIncidents?: number;
}

/** The alerts of the day: only what is not fine, in a fixed order. */
export function alertsOf(facts: AlertFacts): Alert[] {
  const gaps = (facts.tillGaps ?? []).filter((gap) => gap !== 0);
  const found: Record<AlertKind, Alert | null> = {
    late: facts.late ? { kind: 'late', count: facts.late, amount: 0 } : null,
    till_gap:
      gaps.length > 0
        ? { kind: 'till_gap', count: gaps.length, amount: gaps.reduce((sum, gap) => sum + gap, 0) }
        : null,
    discount_over_ceiling: facts.discountsOverCeiling
      ? { kind: 'discount_over_ceiling', count: facts.discountsOverCeiling, amount: 0 }
      : null,
    below_cost: facts.belowCost ? { kind: 'below_cost', count: facts.belowCost, amount: 0 } : null,
    incident: facts.openIncidents ? { kind: 'incident', count: facts.openIncidents, amount: 0 } : null,
    due_soon: facts.dueSoon ? { kind: 'due_soon', count: facts.dueSoon, amount: 0 } : null,
    dormant: facts.dormant ? { kind: 'dormant', count: facts.dormant, amount: 0 } : null,
  };
  return alertKinds.flatMap((kind) => (found[kind] ? [found[kind]] : []));
}
