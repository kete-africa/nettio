import { newId } from '@kete/records';
import { organizationPolicySql, type SqlExecutor } from '@kete/tenancy';
import type { Article, Catalog, Nature, Pack, PackMode, Pricing, Service, Step } from '../catalog.record';

/** The catalogue's tables, each with its row-level security in the same migration. */
export function catalogMigrationSql(options: { schema: string; appRole: string }): string {
  const s = options.schema;
  const secure = (table: string, grants: string) => `
${organizationPolicySql({ schema: s, table, appRole: options.appRole })}
grant ${grants} on ${s}.${table} to ${options.appRole};`;
  return `
create table ${s}.articles (
  article_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 80),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index articles_by_organization on ${s}.articles (organization_id, position);
${secure('articles', 'select, insert, update')}

create table ${s}.steps (
  step_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 80),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index steps_by_organization on ${s}.steps (organization_id, position);
${secure('steps', 'select, insert, update')}

create table ${s}.services (
  service_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 80),
  nature text not null check (nature in ('workshop', 'counter_only', 'logistics')),
  pricing text not null check (pricing in ('per_piece', 'per_kg')),
  position integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index services_by_organization on ${s}.services (organization_id, position);
${secure('services', 'select, insert, update')}

create table ${s}.service_steps (
  organization_id text not null,
  service_id text not null references ${s}.services (service_id),
  step_id text not null references ${s}.steps (step_id),
  position integer not null,
  primary key (service_id, position),
  unique (service_id, step_id)
);
${secure('service_steps', 'select, insert, delete')}

create table ${s}.prices (
  price_id text primary key,
  organization_id text not null,
  service_id text not null references ${s}.services (service_id),
  article_id text references ${s}.articles (article_id),
  amount integer not null check (amount >= 0),
  updated_at timestamptz not null default now()
);
create unique index prices_one_per_couple
  on ${s}.prices (organization_id, service_id, coalesce(article_id, ''));
${secure('prices', 'select, insert, update, delete')}

create table ${s}.packs (
  pack_id text primary key,
  organization_id text not null,
  name text not null check (length(name) between 1 and 80),
  mode text not null check (mode in ('pieces', 'weight')),
  quota numeric(10, 2) not null check (quota > 0),
  price integer not null check (price > 0),
  service_ids text[] not null default '{}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index packs_by_organization on ${s}.packs (organization_id, created_at);
${secure('packs', 'select, insert, update')}
`;
}

export async function readCatalog(db: SqlExecutor): Promise<Catalog> {
  // One query at a time: they share the transaction's connection.
  const articles = await db.query<{ article_id: string; name: string; position: number; active: boolean }>(
    `select article_id, name, position, active from articles order by position, created_at`,
  );
  const steps = await db.query<{ step_id: string; name: string; position: number; active: boolean }>(
    `select step_id, name, position, active from steps order by position, created_at`,
  );
  const services = await db.query<{
    service_id: string;
    name: string;
    nature: Nature;
    pricing: Pricing;
    position: number;
    active: boolean;
  }>(
    `select service_id, name, nature, pricing, position, active from services
      order by position, created_at`,
  );
  const routes = await db.query<{ service_id: string; step_id: string }>(
    `select service_id, step_id from service_steps order by service_id, position`,
  );
  const prices = await db.query<{ service_id: string; article_id: string | null; amount: number }>(
    `select service_id, article_id, amount from prices`,
  );
  const packs = await db.query<{
    pack_id: string;
    name: string;
    mode: PackMode;
    quota: string;
    price: number;
    service_ids: string[];
    active: boolean;
  }>(
    `select pack_id, name, mode, quota, price, service_ids, active from packs order by created_at`,
  );
  return {
    articles: articles.rows.map((r) => ({
      articleId: r.article_id,
      name: r.name,
      position: r.position,
      active: r.active,
    })),
    steps: steps.rows.map((r) => ({
      stepId: r.step_id,
      name: r.name,
      position: r.position,
      active: r.active,
    })),
    services: services.rows.map((r) => ({
      serviceId: r.service_id,
      name: r.name,
      nature: r.nature,
      pricing: r.pricing,
      position: r.position,
      active: r.active,
      stepIds: routes.rows.filter((x) => x.service_id === r.service_id).map((x) => x.step_id),
    })),
    prices: prices.rows.map((r) => ({
      serviceId: r.service_id,
      articleId: r.article_id,
      amount: r.amount,
    })),
    packs: packs.rows.map((r) => ({
      packId: r.pack_id,
      name: r.name,
      mode: r.mode,
      quota: Number(r.quota),
      price: r.price,
      serviceIds: r.service_ids,
      active: r.active,
    })),
  };
}

async function nextPosition(db: SqlExecutor, table: 'articles' | 'steps' | 'services') {
  const { rows } = await db.query<{ next: number }>(
    `select coalesce(max(position), -1) + 1 as next from ${table}`,
  );
  return rows[0]?.next ?? 0;
}

export async function saveArticle(
  db: SqlExecutor,
  organizationId: string,
  article: Pick<Article, 'name' | 'active'> & { articleId?: string | undefined },
): Promise<string> {
  if (article.articleId) {
    const { rows } = await db.query(
      `update articles set name = $2, active = $3 where article_id = $1 returning article_id`,
      [article.articleId, article.name, article.active],
    );
    return rows.length > 0 ? article.articleId : '';
  }
  const articleId = newId('art');
  await db.query(
    `insert into articles (article_id, organization_id, name, position, active)
     values ($1, $2, $3, $4, $5)`,
    [articleId, organizationId, article.name, await nextPosition(db, 'articles'), article.active],
  );
  return articleId;
}

export async function saveStep(
  db: SqlExecutor,
  organizationId: string,
  step: Pick<Step, 'name' | 'active'> & { stepId?: string | undefined },
): Promise<string> {
  if (step.stepId) {
    const { rows } = await db.query(
      `update steps set name = $2, active = $3 where step_id = $1 returning step_id`,
      [step.stepId, step.name, step.active],
    );
    return rows.length > 0 ? step.stepId : '';
  }
  const stepId = newId('stp');
  await db.query(
    `insert into steps (step_id, organization_id, name, position, active)
     values ($1, $2, $3, $4, $5)`,
    [stepId, organizationId, step.name, await nextPosition(db, 'steps'), step.active],
  );
  return stepId;
}

/** Whether a step is on the route of an active service: it cannot be retired then. */
export async function stepIsOnARoute(db: SqlExecutor, stepId: string): Promise<boolean> {
  const { rows } = await db.query(
    `select 1 from service_steps r join services s using (service_id)
      where r.step_id = $1 and s.active limit 1`,
    [stepId],
  );
  return rows.length > 0;
}

export async function saveService(
  db: SqlExecutor,
  organizationId: string,
  service: Pick<Service, 'name' | 'nature' | 'pricing' | 'active' | 'stepIds'> & {
    serviceId?: string | undefined;
  },
): Promise<string> {
  let serviceId = service.serviceId ?? '';
  if (serviceId) {
    const { rows } = await db.query(
      `update services set name = $2, nature = $3, pricing = $4, active = $5
        where service_id = $1 returning service_id`,
      [serviceId, service.name, service.nature, service.pricing, service.active],
    );
    if (rows.length === 0) return '';
    await db.query(`delete from service_steps where service_id = $1`, [serviceId]);
  } else {
    serviceId = newId('svc');
    await db.query(
      `insert into services (service_id, organization_id, name, nature, pricing, position, active)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [
        serviceId,
        organizationId,
        service.name,
        service.nature,
        service.pricing,
        await nextPosition(db, 'services'),
        service.active,
      ],
    );
  }
  for (const [position, stepId] of service.stepIds.entries()) {
    await db.query(
      `insert into service_steps (organization_id, service_id, step_id, position)
       values ($1, $2, $3, $4)`,
      [organizationId, serviceId, stepId, position],
    );
  }
  return serviceId;
}

export async function setPrice(
  db: SqlExecutor,
  organizationId: string,
  price: { serviceId: string; articleId: string | null; amount: number | null },
): Promise<void> {
  await db.query(
    `delete from prices where service_id = $1 and coalesce(article_id, '') = coalesce($2, '')`,
    [price.serviceId, price.articleId],
  );
  if (price.amount === null) return;
  await db.query(
    `insert into prices (price_id, organization_id, service_id, article_id, amount)
     values ($1, $2, $3, $4, $5)`,
    [newId('prc'), organizationId, price.serviceId, price.articleId, price.amount],
  );
}

export async function savePack(
  db: SqlExecutor,
  organizationId: string,
  pack: Omit<Pack, 'packId'> & { packId?: string | undefined },
): Promise<string> {
  if (pack.packId) {
    const { rows } = await db.query(
      `update packs set name = $2, mode = $3, quota = $4, price = $5, service_ids = $6, active = $7
        where pack_id = $1 returning pack_id`,
      [pack.packId, pack.name, pack.mode, pack.quota, pack.price, pack.serviceIds, pack.active],
    );
    return rows.length > 0 ? pack.packId : '';
  }
  const packId = newId('pck');
  await db.query(
    `insert into packs (pack_id, organization_id, name, mode, quota, price, service_ids, active)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      packId,
      organizationId,
      pack.name,
      pack.mode,
      pack.quota,
      pack.price,
      pack.serviceIds,
      pack.active,
    ],
  );
  return packId;
}

/**
 * Writes a starter catalogue at once — steps, articles, services and their routes — in four
 * statements: a laundry starts in a second, wherever its database is.
 */
export async function seedCatalog(
  db: SqlExecutor,
  organizationId: string,
  starter: {
    steps: { key: string; name: string }[];
    articles: string[];
    services: { name: string; pricing: Pricing; route: string[] }[];
  },
): Promise<void> {
  const stepIds = new Map(starter.steps.map((step) => [step.key, newId('stp')]));
  await db.query(
    `insert into steps (step_id, organization_id, name, position)
     select id, $1, name, position::int - 1
       from unnest($2::text[], $3::text[]) with ordinality as t (id, name, position)`,
    [organizationId, [...stepIds.values()], starter.steps.map((step) => step.name)],
  );
  await db.query(
    `insert into articles (article_id, organization_id, name, position)
     select id, $1, name, position::int - 1
       from unnest($2::text[], $3::text[]) with ordinality as t (id, name, position)`,
    [organizationId, starter.articles.map(() => newId('art')), starter.articles],
  );
  const services = starter.services.map((service) => ({ ...service, serviceId: newId('svc') }));
  await db.query(
    `insert into services (service_id, organization_id, name, nature, pricing, position)
     select id, $1, name, 'workshop', pricing, position::int - 1
       from unnest($2::text[], $3::text[], $4::text[]) with ordinality
            as t (id, name, pricing, position)`,
    [
      organizationId,
      services.map((service) => service.serviceId),
      services.map((service) => service.name),
      services.map((service) => service.pricing),
    ],
  );
  const routes = services.flatMap((service) =>
    service.route.map((key, position) => ({
      serviceId: service.serviceId,
      stepId: stepIds.get(key) ?? '',
      position,
    })),
  );
  await db.query(
    `insert into service_steps (organization_id, service_id, step_id, position)
     select $1, service_id, step_id, position
       from unnest($2::text[], $3::text[], $4::int[]) as t (service_id, step_id, position)`,
    [
      organizationId,
      routes.map((route) => route.serviceId),
      routes.map((route) => route.stepId),
      routes.map((route) => route.position),
    ],
  );
}
