import { defineCommand } from '@kete/commands';
import { RuleError } from '@/lib/rule-error';
import { articleInput, packInput, priceInput, serviceInput, stepInput } from './catalog.record';
import { checkPack, checkPrice, checkRoute } from './domain/catalog';
import {
  readCatalog,
  saveArticle,
  savePack,
  saveService,
  saveStep,
  setPrice,
  stepIsOnARoute,
} from './infrastructure/catalog.tables';

// The gestures on the catalogue. None changes a past deposit: a deposit keeps the snapshot of its
// labels and prices (docs/product/model.md).

/** Adds an article, renames it or retires it. */
export const saveArticleCommand = defineCommand({
  name: 'save-article',
  input: articleInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const articleId = await saveArticle(db, organizationId, input);
    if (!articleId) throw new RuleError('not_found');
    return { articleId };
  },
  summarize: (input) => `Article "${input.name}" saved`,
});

/** Adds a step of the workshop, renames it or retires it; a step on a route stays. */
export const saveStepCommand = defineCommand({
  name: 'save-step',
  input: stepInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    if (input.stepId && !input.active && (await stepIsOnARoute(db, input.stepId))) {
      throw new RuleError('step_on_a_route');
    }
    const stepId = await saveStep(db, organizationId, input);
    if (!stepId) throw new RuleError('not_found');
    return { stepId };
  },
  summarize: (input) => `Step "${input.name}" saved`,
});

/** Adds or changes a service: its nature, how it is priced, and its route through the steps. */
export const saveServiceCommand = defineCommand({
  name: 'save-service',
  input: serviceInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const catalog = await readCatalog(db);
    checkRoute(input, catalog.steps);
    const before = catalog.services.find((s) => s.serviceId === input.serviceId);
    // Prices and packs are written for one way of pricing: it does not change under them.
    if (before && before.pricing !== input.pricing) {
      const used =
        catalog.prices.some((p) => p.serviceId === before.serviceId) ||
        catalog.packs.some((p) => p.serviceIds.includes(before.serviceId));
      if (used) throw new RuleError('service_pricing_in_use');
    }
    const serviceId = await saveService(db, organizationId, input);
    if (!serviceId) throw new RuleError('not_found');
    return { serviceId };
  },
  summarize: (input) => `Service "${input.name}" saved, ${input.stepIds.length} step(s)`,
});

/** Sets what an article costs for a service (or a kilo), or stops selling the couple. */
export const setPriceCommand = defineCommand({
  name: 'set-price',
  input: priceInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const catalog = await readCatalog(db);
    const service = catalog.services.find((s) => s.serviceId === input.serviceId);
    if (!service) throw new RuleError('not_found');
    if (input.articleId && !catalog.articles.some((a) => a.articleId === input.articleId)) {
      throw new RuleError('not_found');
    }
    checkPrice(service, input);
    await setPrice(db, organizationId, input);
    return { serviceId: input.serviceId, articleId: input.articleId, amount: input.amount };
  },
  summarize: (input) =>
    input.amount === null ? 'A price removed' : `A price set at ${input.amount}`,
});

/** Adds or changes a pack: a fixed price for a quota of pieces or kilos. */
export const savePackCommand = defineCommand({
  name: 'save-pack',
  input: packInput,
  reversibility: { reversible: false },
  async handler(input, { db, organizationId }) {
    const catalog = await readCatalog(db);
    checkPack(input, catalog.services);
    const packId = await savePack(db, organizationId, input);
    if (!packId) throw new RuleError('not_found');
    return { packId };
  },
  summarize: (input) => `Pack "${input.name}" saved`,
});
