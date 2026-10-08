import { z } from 'zod';

// The catalogue as the laundry sets it (docs/product/model.md): what it treats (articles), what it
// does to them (services, each with its route through the workshop's steps), and what it charges
// (prices, packs). Nettio proposes names, never a price.

export const natures = ['workshop', 'counter_only', 'logistics'] as const;
export type Nature = (typeof natures)[number];

export const pricings = ['per_piece', 'per_kg'] as const;
export type Pricing = (typeof pricings)[number];

export const packModes = ['pieces', 'weight'] as const;
export type PackMode = (typeof packModes)[number];

const id = z.string().min(1).max(64);
const name = z.string().trim().min(1).max(80);
/** Amounts are whole francs: the currency has no decimals. */
const amount = z.number().int().min(0).max(100_000_000);

export const articleInput = z.object({
  articleId: id.optional(),
  name,
  active: z.boolean().default(true),
});

export const stepInput = z.object({
  stepId: id.optional(),
  name,
  active: z.boolean().default(true),
});

export const serviceInput = z.object({
  serviceId: id.optional(),
  name,
  nature: z.enum(natures),
  pricing: z.enum(pricings),
  /** Its route: the steps of the workshop it goes through, in order. Empty: straight to ready. */
  stepIds: z.array(id).max(20).default([]),
  active: z.boolean().default(true),
});

export const priceInput = z.object({
  serviceId: id,
  /** Null for a per-kilo service: the price of a kilo. */
  articleId: id.nullable(),
  /** Null removes the price: the couple is no longer sold. */
  amount: amount.nullable(),
});

export const packInput = z.object({
  packId: id.optional(),
  name,
  mode: z.enum(packModes),
  /** Pieces, or kilos. */
  quota: z.number().positive().max(10_000),
  price: amount.min(1),
  /** The services it admits; none named means all of its mode. */
  serviceIds: z.array(id).max(50).default([]),
  active: z.boolean().default(true),
});

export interface Article {
  articleId: string;
  name: string;
  position: number;
  active: boolean;
}

export interface Step {
  stepId: string;
  name: string;
  position: number;
  active: boolean;
}

export interface Service {
  serviceId: string;
  name: string;
  nature: Nature;
  pricing: Pricing;
  position: number;
  active: boolean;
  /** Its route, in order. */
  stepIds: string[];
}

export interface Price {
  serviceId: string;
  articleId: string | null;
  amount: number;
}

export interface Pack {
  packId: string;
  name: string;
  mode: PackMode;
  quota: number;
  price: number;
  serviceIds: string[];
  active: boolean;
}

/** Everything a counter, a diagram or a copilot needs of the catalogue, read at once. */
export interface Catalog {
  articles: Article[];
  steps: Step[];
  services: Service[];
  prices: Price[];
  packs: Pack[];
}
