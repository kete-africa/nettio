import { RuleError } from '@/lib/rule-error';

// Several sites (specs/028-sites): deposits that travel between a counter and the plant with a
// slip, shared costs spread over the sites, what each site earns, a partner's commission. Pure
// rules; nothing here reads a clock or a database.

export const allocationKeys = ['sales', 'pieces', 'equal'] as const;
export type AllocationKey = (typeof allocationKeys)[number];

/**
 * Spreads an amount over the sites by their weights, to the franc: the parts always add up to
 * the amount (largest remainders take the francs left). With no weight at all, in equal parts.
 */
export function allocate(amount: number, weights: { siteId: string; weight: number }[]): Map<string, number> {
  const parts = new Map<string, number>();
  if (weights.length === 0) return parts;
  const total = weights.reduce((sum, each) => sum + Math.max(0, each.weight), 0);
  const shares = weights.map((each) => {
    const exact = total > 0 ? (amount * Math.max(0, each.weight)) / total : amount / weights.length;
    return { siteId: each.siteId, floor: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = amount - shares.reduce((sum, share) => sum + share.floor, 0);
  for (const share of [...shares].sort((a, b) => b.rest - a.rest || a.siteId.localeCompare(b.siteId))) {
    parts.set(share.siteId, share.floor + (left > 0 ? 1 : 0));
    if (left > 0) left -= 1;
  }
  return parts;
}

export interface SiteFigures {
  siteId: string;
  name: string;
  /** The deposits received at the site in the month, cancelled ones apart. */
  orders: number;
  pieces: number;
  sales: number;
  /** Payments minus refunds taken at the site — whatever the way, credit included. */
  cashed: number;
  /** The charges of the month that name this site. */
  charges: number;
}

export interface SiteResult extends SiteFigures {
  /** Its part of the charges that name no site. */
  shared: number;
  result: number;
  /** What a partner earns on what it received: said, not deducted — it is paid as an expense. */
  commission: number | null;
}

/** What a partner's point earns it: a percentage of what it received, to the franc. */
export const commissionOf = (sales: number, percent: number): number => Math.round((sales * percent) / 100);

/**
 * What each site earns in a month: what it cashed, minus its own charges, minus its part of the
 * shared ones. The parts add up: the sites' results plus the prepaid credit not spent yet are
 * the laundry's result.
 */
export function siteResults(input: {
  sites: SiteFigures[];
  sharedCharges: number;
  key: AllocationKey;
  /** The commission percentage of the partner points, by site. */
  partners: Map<string, number>;
}): SiteResult[] {
  const weight = (site: SiteFigures) => (input.key === 'sales' ? site.sales : input.key === 'pieces' ? site.pieces : 1);
  const parts = allocate(
    input.sharedCharges,
    input.sites.map((site) => ({ siteId: site.siteId, weight: weight(site) })),
  );
  return input.sites.map((site) => {
    const shared = parts.get(site.siteId) ?? 0;
    const percent = input.partners.get(site.siteId);
    return {
      ...site,
      shared,
      result: site.cashed - site.charges - shared,
      commission: percent === undefined ? null : commissionOf(site.sales, percent),
    };
  });
}

/** « T-0042 »: a transfer's slip number. */
export const transferNumber = (seq: number): string => `T-${String(seq).padStart(4, '0')}`;

/** Where a deposit is: at a site, on the road, or not found when its transfer was received. */
export type Place =
  | { where: 'site'; siteId: string }
  | { where: 'transit'; toSiteId: string; transferId: string }
  | { where: 'missing'; transferId: string };

export function placeOf(
  homeSiteId: string,
  last: { transferId: string; toSiteId: string; status: 'sent' | 'received'; received: boolean } | null,
): Place {
  if (!last) return { where: 'site', siteId: homeSiteId };
  if (last.status === 'sent') return { where: 'transit', toSiteId: last.toSiteId, transferId: last.transferId };
  return last.received ? { where: 'site', siteId: last.toSiteId } : { where: 'missing', transferId: last.transferId };
}

/** Where a deposit should go next, if anywhere: to its plant while it is worked on, home once ready. */
export function nextStop(order: {
  status: string;
  homeSiteId: string;
  plantSiteId: string | null;
  place: Place;
}): string | null {
  if (order.place.where !== 'site') return null;
  const here = order.place.siteId;
  if (order.status === 'ready') return here === order.homeSiteId ? null : order.homeSiteId;
  if (order.status === 'received' || order.status === 'in_progress') {
    return order.plantSiteId && here !== order.plantSiteId ? order.plantSiteId : null;
  }
  return null;
}

/** What may leave together: deposits that are all at the site they leave from, still open. */
export function checkTransfer(transfer: {
  fromSiteId: string;
  toSiteId: string;
  orders: { status: string; place: Place }[];
}): void {
  if (transfer.fromSiteId === transfer.toSiteId) throw new RuleError('transfer_same_site');
  if (transfer.orders.length === 0) throw new RuleError('transfer_empty');
  for (const order of transfer.orders) {
    if (order.status === 'cancelled' || order.status === 'collected') throw new RuleError('order_not_open');
    if (order.place.where !== 'site' || order.place.siteId !== transfer.fromSiteId) {
      throw new RuleError('transfer_not_here');
    }
  }
}

/** A slip received: what arrived, and what the slip said that did not. */
export function receptionOf(expected: string[], arrived: string[]): { received: string[]; missing: string[] } {
  const known = new Set(expected);
  const here = new Set(arrived.filter((orderId) => known.has(orderId)));
  if (here.size !== arrived.length) throw new RuleError('transfer_unknown_deposit');
  return { received: [...here], missing: expected.filter((orderId) => !here.has(orderId)) };
}
