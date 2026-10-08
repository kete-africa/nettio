import app from '../../kete.json' with { type: 'json' };

// What this app is (kete.json, the manifest.v1 contract): its identifier, version and events.
export const PRODUCT = app.product;
export const VERSION = app.version;
/** The name MCP clients show. */
export const APP_SLUG = app.product.replace(/^prd_/, '').replaceAll('_', '-');
/** `kete` for a Kete App, `workspace` for an enterprise's app, or its own design (D-038). */
export const DESIGN: string = 'kete';
