import { createCenter, type Center } from '@kete/center';
import { APP_SLUG, PRODUCT } from './app';

let center: Center | undefined;

/**
 * The center, Kete Enterprise (kete-core spec 049): the person's grants for this app, her To do.
 * Without `ENTERPRISE_API_URL`, the app works alone.
 */
export function getCenter(): Center {
  center ??= createCenter({
    url: process.env.ENTERPRISE_API_URL,
    product: PRODUCT,
    source: APP_SLUG,
  });
  return center;
}
