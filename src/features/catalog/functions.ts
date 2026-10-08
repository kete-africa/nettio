import { createServerFn } from '@tanstack/react-start';
import { perform } from '@/platform/screen';
import {
  articleInput,
  packInput,
  priceInput,
  serviceInput,
  stepInput,
  type Catalog,
} from './catalog.record';

type CatalogView = Catalog & {
  gaps: { servicesWithoutPrice: string[]; packsWithoutService: string[] };
};

/** The catalogue as a screen shows it; null when the person may not see the business. */
export const fetchCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  const read = await perform<CatalogView>('catalog_read', {});
  return read.ok ? read.output : null;
});

export const saveArticle = createServerFn({ method: 'POST' })
  .validator((input: unknown) => articleInput.parse(input))
  .handler(({ data }) => perform<{ articleId: string }>('catalog_save_article', data));

export const saveStep = createServerFn({ method: 'POST' })
  .validator((input: unknown) => stepInput.parse(input))
  .handler(({ data }) => perform<{ stepId: string }>('catalog_save_step', data));

export const saveService = createServerFn({ method: 'POST' })
  .validator((input: unknown) => serviceInput.parse(input))
  .handler(({ data }) => perform<{ serviceId: string }>('catalog_save_service', data));

export const setPrice = createServerFn({ method: 'POST' })
  .validator((input: unknown) => priceInput.parse(input))
  .handler(({ data }) => perform<{ amount: number | null }>('catalog_set_price', data));

export const savePack = createServerFn({ method: 'POST' })
  .validator((input: unknown) => packInput.parse(input))
  .handler(({ data }) => perform<{ packId: string }>('catalog_save_pack', data));
