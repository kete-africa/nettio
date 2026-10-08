import * as m from '@/paraglide/messages.js';
import type { Outcome } from './rule-error';

// An error says three things (docs/product/voix.md): what happened, why, what to do. One sentence
// per code a rule can raise; an unknown code falls back to the generic sentence.
const sentences: Record<string, () => string> = {
  not_allowed: m.error_not_allowed,
  invalid_input: m.error_invalid_input,
  not_found: m.error_not_found,
  already_set_up: m.error_already_set_up,
  not_set_up: m.error_not_set_up,
  site_code_taken: m.error_site_code_taken,
  site_plant_not_needed: m.error_site_plant_not_needed,
  site_plant_unknown: m.error_site_plant_unknown,
  site_last_counter: m.error_site_last_counter,
  site_plant_in_use: m.error_site_plant_in_use,
  owner_keeps_everything: m.error_owner_keeps_everything,
  permission_unknown: m.error_invalid_input,
  route_not_for_this_nature: m.error_route_not_for_this_nature,
  route_step_unknown: m.error_route_step_unknown,
  route_step_twice: m.error_route_step_twice,
  step_on_a_route: m.error_step_on_a_route,
  service_pricing_in_use: m.error_service_pricing_in_use,
  price_needs_article: m.error_invalid_input,
  price_per_kilo_has_no_article: m.error_invalid_input,
  pack_service_unknown: m.error_not_found,
  pack_service_wrong_mode: m.error_pack_service_wrong_mode,
};

/** The sentence a screen shows for a gesture that did not go through. */
export function errorSentence(code: string): string {
  return (sentences[code] ?? m.error_generic)();
}

/** The sentence of a failed outcome, or null when it went through. */
export function failure(outcome: Outcome<unknown>): string | null {
  return outcome.ok ? null : errorSentence(outcome.code);
}
