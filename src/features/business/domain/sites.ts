import { RuleError } from '@/lib/rule-error';
import type { Site, SiteKind } from '../business.record';

// The rules of the sites, pure: no database, no framework, tested alone.

/** A site where customers leave their laundry. */
export const receives = (kind: SiteKind): boolean => kind !== 'plant';

/** A site where laundry is processed. */
export const processes = (kind: SiteKind): boolean => kind !== 'counter';

/**
 * Checks a site against the others before it is saved: its code is its own, a counter is attached
 * to a site that processes, a site that processes is attached to none, and the business keeps one
 * site that receives.
 */
export function checkSite(
  site: Omit<Site, 'siteId'> & { siteId?: string | undefined },
  others: Site[],
): void {
  const rest = others.filter((other) => other.siteId !== site.siteId);
  if (rest.some((other) => other.code === site.code)) {
    throw new RuleError('site_code_taken', { code: site.code });
  }
  if (site.plantSiteId !== null) {
    if (processes(site.kind)) throw new RuleError('site_plant_not_needed');
    const plant = rest.find((other) => other.siteId === site.plantSiteId);
    if (!plant || !plant.active || !processes(plant.kind)) {
      throw new RuleError('site_plant_unknown');
    }
  }
  const stillReceives =
    (site.active && receives(site.kind)) ||
    rest.some((other) => other.active && receives(other.kind));
  if (!stillReceives) throw new RuleError('site_last_counter');
  // A plant others send to cannot stop processing.
  if (site.siteId && (!site.active || !processes(site.kind))) {
    if (rest.some((other) => other.active && other.plantSiteId === site.siteId)) {
      throw new RuleError('site_plant_in_use');
    }
  }
}

/** Where a deposit received at `site` is processed: itself, or the plant it is attached to. */
export function plantOf(site: Site, sites: Site[]): Site | null {
  if (processes(site.kind)) return site;
  return sites.find((other) => other.siteId === site.plantSiteId) ?? null;
}
