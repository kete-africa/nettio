import { z } from 'zod';
import { incidentKinds } from './domain/work';

// The inputs of the gestures of the workshop: one schema each, shared by the screen, the server
// and the MCP tool.

const id = z.string().min(1).max(64);

export const advanceInput = z.object({ unitId: id });

export const incidentInput = z.object({
  unitId: id,
  kind: z.enum(incidentKinds),
  note: z.string().trim().max(500).default(''),
  /** The step of its route the unit goes back to — a rework; null when it stays where it is. */
  backToStepId: id.nullable().default(null),
});

export const resolveInput = z.object({
  incidentId: id,
  /** What was done about it. */
  resolution: z.string().trim().min(1).max(500),
});
