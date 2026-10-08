import * as m from '@/paraglide/messages.js';
import type { FlowWords } from './domain/flow';

/** The words of the diagram, in the person's language. */
export function flowWords(): FlowWords {
  return {
    sites: m.flow_sites(),
    routes: m.flow_routes(),
    life: m.flow_life(),
    sendsTo: m.flow_sends_to(),
    direct: m.flow_direct(),
    siteKinds: {
      counter: m.site_kind_counter(),
      plant: m.site_kind_plant(),
      counter_plant: m.site_kind_counter_plant(),
    },
    pricings: { per_piece: m.pricing_per_piece(), per_kg: m.pricing_per_kg() },
    natures: {
      workshop: m.nature_workshop(),
      counter_only: m.nature_counter_only(),
      logistics: m.nature_logistics(),
    },
    states: {
      received: m.order_state_received(),
      in_progress: m.order_state_in_progress(),
      ready: m.order_state_ready(),
      collected: m.order_state_collected(),
      cancelled: m.order_state_cancelled(),
    },
  };
}
