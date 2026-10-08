import { RuleError } from '@/lib/rule-error';
import type { Catalog, Pack, Price, Service, Step } from '../catalog.record';

// The rules of the catalogue, pure: no database, no framework, tested alone.

/** A route names known, active steps, each once; a service off the workshop has none. */
export function checkRoute(
  service: Pick<Service, 'nature' | 'stepIds'>,
  steps: Pick<Step, 'stepId' | 'active'>[],
): void {
  if (service.nature !== 'workshop' && service.stepIds.length > 0) {
    throw new RuleError('route_not_for_this_nature');
  }
  const known = new Set(steps.filter((step) => step.active).map((step) => step.stepId));
  const seen = new Set<string>();
  for (const stepId of service.stepIds) {
    if (!known.has(stepId)) throw new RuleError('route_step_unknown');
    if (seen.has(stepId)) throw new RuleError('route_step_twice');
    seen.add(stepId);
  }
}

/** A per-piece service is priced per article; a per-kilo service has one price, for a kilo. */
export function checkPrice(
  service: Pick<Service, 'pricing'>,
  price: Pick<Price, 'articleId'>,
): void {
  if (service.pricing === 'per_piece' && price.articleId === null) {
    throw new RuleError('price_needs_article');
  }
  if (service.pricing === 'per_kg' && price.articleId !== null) {
    throw new RuleError('price_per_kilo_has_no_article');
  }
}

/** A pack admits services of its own mode only: pieces with per-piece, weight with per-kilo. */
export function checkPack(
  pack: Pick<Pack, 'mode' | 'serviceIds'>,
  services: Pick<Service, 'serviceId' | 'pricing'>[],
): void {
  const wanted = pack.mode === 'pieces' ? 'per_piece' : 'per_kg';
  for (const serviceId of pack.serviceIds) {
    const service = services.find((s) => s.serviceId === serviceId);
    if (!service) throw new RuleError('pack_service_unknown');
    if (service.pricing !== wanted) throw new RuleError('pack_service_wrong_mode');
  }
}

/** Whether a pack admits a service: named, or any of its mode when it names none. */
export function packAdmits(
  pack: Pick<Pack, 'mode' | 'serviceIds'>,
  service: Pick<Service, 'serviceId' | 'pricing'>,
): boolean {
  const wanted = pack.mode === 'pieces' ? 'per_piece' : 'per_kg';
  if (service.pricing !== wanted) return false;
  return pack.serviceIds.length === 0 || pack.serviceIds.includes(service.serviceId);
}

/** The price of an article for a service, or of a kilo; undefined when it is not sold. */
export function priceOf(
  prices: Price[],
  serviceId: string,
  articleId: string | null,
): number | undefined {
  return prices.find((p) => p.serviceId === serviceId && p.articleId === articleId)?.amount;
}

/** What is still missing before the counter can sell: said to the owner, never guessed. */
export function catalogGaps(catalog: Catalog): {
  servicesWithoutPrice: string[];
  packsWithoutService: string[];
} {
  const sold = new Set(catalog.prices.map((p) => p.serviceId));
  return {
    servicesWithoutPrice: catalog.services
      .filter((s) => s.active && !sold.has(s.serviceId))
      .map((s) => s.name),
    packsWithoutService: catalog.packs
      .filter(
        (pack) => pack.active && !catalog.services.some((s) => s.active && packAdmits(pack, s)),
      )
      .map((pack) => pack.name),
  };
}
