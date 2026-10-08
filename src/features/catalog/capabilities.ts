import { defineCapability } from '@kete/capabilities';
import { z } from 'zod';
import { articleInput, packInput, priceInput, serviceInput, stepInput } from './catalog.record';
import {
  saveArticleCommand,
  savePackCommand,
  saveServiceCommand,
  saveStepCommand,
  setPriceCommand,
} from './commands';
import { catalogGaps } from './domain/catalog';
import { readCatalog } from './infrastructure/catalog.tables';

/**
 * What a screen, a copilot or an agent may do with the catalogue. Reading is free for whoever sees
 * the business; a change commits what the counter will sell, so an agent only prepares it (level
 * 3) and a person validates. An agent never proposes a price on its own initiative
 * (constitution III): it writes the one the owner dictated.
 */
export const catalogCapabilities = [
  defineCapability({
    name: 'catalog_read',
    description:
      'The catalogue of the laundry: articles, workshop steps, services with their route, prices and packs, and what is still missing before the counter can sell.',
    permission: 'business:read',
    autonomy: 1,
    input: z.object({}),
    async run(_input, { db }) {
      const catalog = await readCatalog(db);
      return { ...catalog, gaps: catalogGaps(catalog) };
    },
  }),
  defineCapability({
    name: 'catalog_save_article',
    description: 'Adds an article (a type of piece), renames it or retires it.',
    permission: 'catalog:manage',
    autonomy: 3,
    input: articleInput,
    command: saveArticleCommand,
    draft: { recordType: 'article' },
  }),
  defineCapability({
    name: 'catalog_save_step',
    description: 'Adds a step of the workshop, renames it or retires it.',
    permission: 'catalog:manage',
    autonomy: 3,
    input: stepInput,
    command: saveStepCommand,
    draft: { recordType: 'step' },
  }),
  defineCapability({
    name: 'catalog_save_service',
    description:
      'Adds or changes a service: its nature, per-piece or per-kilo pricing, and its route (the ordered steps of the workshop).',
    permission: 'catalog:manage',
    autonomy: 3,
    input: serviceInput,
    command: saveServiceCommand,
    draft: { recordType: 'service' },
  }),
  defineCapability({
    name: 'catalog_set_price',
    description:
      'Sets the price the owner decided for an article and a service (or for a kilo), or removes it. Never propose a price yourself.',
    permission: 'catalog:manage',
    autonomy: 3,
    input: priceInput,
    command: setPriceCommand,
    draft: { recordType: 'price' },
  }),
  defineCapability({
    name: 'catalog_save_pack',
    description:
      'Adds or changes a pack: a fixed price the owner decided for a quota of pieces or kilos.',
    permission: 'catalog:manage',
    autonomy: 3,
    input: packInput,
    command: savePackCommand,
    draft: { recordType: 'pack' },
  }),
];
