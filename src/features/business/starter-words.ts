import * as m from '@/paraglide/messages.js';
import type { StarterWords } from './domain/starter';

/** The names of the starter catalogue, in the language the laundry starts in. */
export function starterWords(locale: 'fr' | 'en'): StarterWords {
  const say = (message: (inputs: Record<string, never>, options: { locale: 'fr' | 'en' }) => string) =>
    message({}, { locale });
  return {
    plantName: say(m.starter_plant_name),
    steps: {
      sorting: say(m.starter_step_sorting),
      spotting: say(m.starter_step_spotting),
      washing: say(m.starter_step_washing),
      drying: say(m.starter_step_drying),
      ironing: say(m.starter_step_ironing),
      checking: say(m.starter_step_checking),
      packing: say(m.starter_step_packing),
      storing: say(m.starter_step_storing),
    },
    articles: {
      shirt: say(m.starter_article_shirt),
      trousers: say(m.starter_article_trousers),
      jacket: say(m.starter_article_jacket),
      suit: say(m.starter_article_suit),
      dress: say(m.starter_article_dress),
      skirt: say(m.starter_article_skirt),
      wrapper: say(m.starter_article_wrapper),
      boubou: say(m.starter_article_boubou),
      sheet: say(m.starter_article_sheet),
      duvet: say(m.starter_article_duvet),
      curtain: say(m.starter_article_curtain),
      tablecloth: say(m.starter_article_tablecloth),
    },
    services: {
      wash_iron: say(m.starter_service_wash_iron),
      iron_only: say(m.starter_service_iron_only),
      dry_clean: say(m.starter_service_dry_clean),
      by_kilo: say(m.starter_service_by_kilo),
    },
  };
}
