import type { Profile, SiteKind, Staffing } from '../business.record';

// What Nettio prepares when a laundry starts (docs/product/referentiels.md): sites, the usual
// steps, four services with their routes, twelve articles. Names only — never a price.

export const starterSteps = [
  'sorting',
  'spotting',
  'washing',
  'drying',
  'ironing',
  'checking',
  'packing',
  'storing',
] as const;
export type StarterStep = (typeof starterSteps)[number];

export const starterArticles = [
  'shirt',
  'trousers',
  'jacket',
  'suit',
  'dress',
  'skirt',
  'wrapper',
  'boubou',
  'sheet',
  'duvet',
  'curtain',
  'tablecloth',
] as const;
export type StarterArticle = (typeof starterArticles)[number];

export const starterServices = [
  {
    key: 'wash_iron',
    pricing: 'per_piece',
    route: ['sorting', 'washing', 'drying', 'ironing', 'checking', 'storing'],
  },
  { key: 'iron_only', pricing: 'per_piece', route: ['ironing', 'checking', 'storing'] },
  {
    key: 'dry_clean',
    pricing: 'per_piece',
    route: ['sorting', 'spotting', 'washing', 'ironing', 'checking', 'storing'],
  },
  {
    key: 'by_kilo',
    pricing: 'per_kg',
    route: ['sorting', 'washing', 'drying', 'packing', 'storing'],
  },
] as const satisfies readonly {
  key: string;
  pricing: 'per_piece' | 'per_kg';
  route: readonly StarterStep[];
}[];
export type StarterService = (typeof starterServices)[number]['key'];

/** The words of the starter, in the laundry's language: supplied by the application layer. */
export interface StarterWords {
  steps: Record<StarterStep, string>;
  articles: Record<StarterArticle, string>;
  services: Record<StarterService, string>;
  /** The name of the plant a chain starts with. */
  plantName: string;
}

export interface Starter {
  sites: { name: string; code: string; kind: SiteKind; attachedToPlant: boolean }[];
  steps: { key: StarterStep; name: string }[];
  articles: string[];
  services: { name: string; pricing: 'per_piece' | 'per_kg'; route: StarterStep[] }[];
}

/**
 * The starting point of a laundry. One site that receives and processes, except for a chain: a
 * plant, and a counter attached to it. The plant's code is `C`, or `P` when the counter took it.
 */
export function starterFor(
  input: { profile: Profile; staffing: Staffing; siteName: string; siteCode: string },
  words: StarterWords,
): Starter {
  const sites: Starter['sites'] =
    input.profile === 'multi_site'
      ? [
          {
            name: words.plantName,
            code: input.siteCode === 'C' ? 'P' : 'C',
            kind: 'plant',
            attachedToPlant: false,
          },
          { name: input.siteName, code: input.siteCode, kind: 'counter', attachedToPlant: true },
        ]
      : [
          {
            name: input.siteName,
            code: input.siteCode,
            kind: 'counter_plant',
            attachedToPlant: false,
          },
        ];
  return {
    sites,
    steps: starterSteps.map((key) => ({ key, name: words.steps[key] })),
    articles: starterArticles.map((key) => words.articles[key]),
    services: starterServices.map((service) => ({
      name: words.services[service.key],
      pricing: service.pricing,
      route: [...service.route],
    })),
  };
}
