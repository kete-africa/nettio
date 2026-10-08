import type { Words } from '@kete/capabilities';

type Message = (inputs: Record<string, never>, options: { locale: 'fr' | 'en' }) => string;

/** A catalog message in each language of Kete, for what the app declares in its card. */
export function words(message: Message): Words {
  return { fr: message({}, { locale: 'fr' }), en: message({}, { locale: 'en' }) };
}
