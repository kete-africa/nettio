import * as m from '@/paraglide/messages.js';
import type { IncidentKind } from '../domain/work';

/** The words of an incident, in the person's language. */
export const incidentWords: Record<IncidentKind, () => string> = {
  stain_left: m.incident_stain_left,
  damage: m.incident_damage,
  missing_piece: m.incident_missing_piece,
  found_object: m.incident_found_object,
  other: m.incident_other,
};
