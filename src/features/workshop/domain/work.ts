import { RuleError } from '@/lib/rule-error';

// The workshop (docs/product/model.md, « L'atelier »), pure: which work units a deposit opens,
// how a unit moves along its route, what a rework does.

export interface RouteStep {
  stepId: string;
  name: string;
}

/** A line of a deposit as the workshop needs it. */
export interface WorkLine {
  serviceId: string;
  serviceName: string;
  /** The route of its service when the deposit was received; empty off the workshop. */
  route: RouteStep[];
  articleName: string | null;
  pricing: 'per_piece' | 'per_kg';
  quantity: number;
}

export interface NewUnit {
  serviceId: string;
  label: string;
  /** Pieces — or kilos — the unit stands for. */
  quantity: number;
  route: RouteStep[];
}

/**
 * The work units of a deposit. At the bag grain, one per service that goes through the workshop;
 * at the piece grain, one per piece (a line by the kilo is one unit). A service with no step opens
 * none: it goes from « received » to « ready » directly.
 */
export function openUnits(lines: WorkLine[], tracking: 'bag' | 'piece'): NewUnit[] {
  const worked = lines.filter((line) => line.route.length > 0);
  if (tracking === 'bag') {
    const byService = new Map<string, NewUnit>();
    for (const line of worked) {
      const unit = byService.get(line.serviceId);
      if (unit) unit.quantity += line.quantity;
      else {
        byService.set(line.serviceId, {
          serviceId: line.serviceId,
          label: line.serviceName,
          quantity: line.quantity,
          route: line.route,
        });
      }
    }
    return [...byService.values()];
  }
  return worked.flatMap((line) => {
    if (line.pricing === 'per_kg' || !line.articleName) {
      return [
        { serviceId: line.serviceId, label: line.serviceName, quantity: line.quantity, route: line.route },
      ];
    }
    return Array.from({ length: line.quantity }, (_unused, index) => ({
      serviceId: line.serviceId,
      label: `${line.articleName} ${index + 1}/${line.quantity} · ${line.serviceName}`,
      quantity: 1,
      route: line.route,
    }));
  });
}

export interface UnitProgress {
  route: RouteStep[];
  /** The index of the step it waits at; the route's length once it is finished. */
  position: number;
}

export const isFinished = (unit: UnitProgress): boolean => unit.position >= unit.route.length;

/** The step a unit waits at, or null once it finished its route. */
export const currentStep = (unit: UnitProgress): RouteStep | null => unit.route[unit.position] ?? null;

/** Validates the step a unit waits at: it moves to the next one, or finishes. */
export function advance(unit: UnitProgress): { position: number; done: RouteStep; finished: boolean } {
  const done = currentStep(unit);
  if (!done) throw new RuleError('unit_finished');
  const position = unit.position + 1;
  return { position, done, finished: position >= unit.route.length };
}

/**
 * Sends a unit back to an earlier step of its route — a rework. The step must be on its route,
 * and before where it stands.
 */
export function sendBack(unit: UnitProgress, stepId: string): number {
  const index = unit.route.findIndex((step) => step.stepId === stepId);
  if (index < 0) throw new RuleError('step_not_on_route');
  if (index >= unit.position) throw new RuleError('step_not_before');
  return index;
}

export const incidentKinds = ['stain_left', 'damage', 'missing_piece', 'found_object', 'other'] as const;
export type IncidentKind = (typeof incidentKinds)[number];
