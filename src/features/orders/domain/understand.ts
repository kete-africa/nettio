// A deposit said in a sentence or dictated (specs/011-dictate). A model places the words on the
// laundry's catalogue; this file — pure code — decides what is kept: only what the catalogue
// sells, in quantities that can be. The model never sets a price, and nothing it returned is
// trusted before it went through here (constitution II).

/** What the counter sells, as the model and this file see it. */
export interface HeardCatalog {
  services: { serviceId: string; name: string; pricing: 'per_piece' | 'per_kg' }[];
  articles: { articleId: string; name: string }[];
  /** The couples that have a price: the only ones a deposit may hold. */
  prices: { serviceId: string; articleId: string | null }[];
  packs: { packId: string; name: string }[];
}

/** What the model returned: identifiers it read in the catalogue, and the words it could not place. */
export interface Heard {
  phone: string | null;
  customerName: string | null;
  lines: {
    serviceId: string;
    articleId: string | null;
    quantity: number;
    defects: string | null;
  }[];
  packId: string | null;
  express: boolean;
  notFound: string[];
}

/** What the screen fills its form with — for the person to check and save. */
export interface Understood {
  phone: string | null;
  customerName: string | null;
  lines: { serviceId: string; articleId: string | null; quantity: number; defects: string }[];
  packId: string | null;
  express: boolean;
  /** What was said and is not in the deposit: a piece with no price, a quantity that cannot be. */
  notFound: string[];
}

const MOST = 500;

/**
 * Keeps of what was heard only what the catalogue sells. A couple with no price, an unknown
 * identifier, a quantity that cannot be (half a shirt, zero, a thousand) leaves the deposit and
 * is named, so that the person sees what was dropped.
 */
export function settle(heard: Heard, catalog: HeardCatalog): Understood {
  const notFound = heard.notFound.map((words) => words.trim()).filter(Boolean);
  const lines = new Map<string, Understood['lines'][number]>();
  for (const line of heard.lines) {
    const service = catalog.services.find((s) => s.serviceId === line.serviceId);
    const articleId = service?.pricing === 'per_kg' ? null : line.articleId;
    const article = catalog.articles.find((a) => a.articleId === articleId);
    const label = [article?.name, service?.name].filter(Boolean).join(' · ') || line.serviceId;
    const sold =
      service &&
      catalog.prices.some((p) => p.serviceId === service.serviceId && p.articleId === articleId);
    if (!service || !sold || (service.pricing === 'per_piece' && !article)) {
      notFound.push(label);
      continue;
    }
    const quantity = Math.round(line.quantity * 1000) / 1000;
    const possible =
      quantity > 0 && quantity <= MOST && (service.pricing === 'per_kg' || Number.isInteger(quantity));
    if (!possible) {
      notFound.push(`${label} (${line.quantity})`);
      continue;
    }
    const key = `${service.serviceId}|${articleId ?? ''}`;
    const known = lines.get(key);
    lines.set(key, {
      serviceId: service.serviceId,
      articleId,
      quantity: Math.round(((known?.quantity ?? 0) + quantity) * 1000) / 1000,
      defects: [known?.defects, line.defects?.trim()].filter(Boolean).join(' ; ').slice(0, 300),
    });
  }
  const digits = heard.phone?.replace(/\D/g, '') ?? '';
  return {
    phone: digits.length >= 8 && digits.length <= 15 ? digits : null,
    customerName: heard.customerName?.trim().slice(0, 120) || null,
    lines: [...lines.values()],
    packId: catalog.packs.some((pack) => pack.packId === heard.packId) ? heard.packId : null,
    express: heard.express === true,
    notFound: [...new Set(notFound)],
  };
}

/** The catalogue as the model reads it: names and identifiers, never a price. */
export function catalogForModel(catalog: HeardCatalog): string {
  const sold = (serviceId: string) =>
    catalog.articles.filter((article) =>
      catalog.prices.some((p) => p.serviceId === serviceId && p.articleId === article.articleId),
    );
  const services = catalog.services.filter((service) =>
    catalog.prices.some((p) => p.serviceId === service.serviceId),
  );
  return [
    'Services (the first one is the default when none is said):',
    ...services.map(
      (service) =>
        `- ${service.serviceId} "${service.name}" (${service.pricing === 'per_kg' ? 'per kilo: quantity in kilos, articleId null' : 'per piece'})`,
    ),
    'Articles sold, per service:',
    ...services
      .filter((service) => service.pricing === 'per_piece')
      .map(
        (service) =>
          `- ${service.serviceId}: ${sold(service.serviceId)
            .map((article) => `${article.articleId} "${article.name}"`)
            .join(', ')}`,
      ),
    'Packs:',
    ...(catalog.packs.length > 0
      ? catalog.packs.map((pack) => `- ${pack.packId} "${pack.name}"`)
      : ['- (none)']),
  ].join('\n');
}
