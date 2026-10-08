import { EmptyState, PageHeader, Tabs } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { fetchCatalog, saveArticle, saveStep } from '@/features/catalog/functions';
import { NamesTab } from '@/features/catalog/ui/NamesTab';
import { PacksTab } from '@/features/catalog/ui/PacksTab';
import { PricesTab } from '@/features/catalog/ui/PricesTab';
import { ServicesTab } from '@/features/catalog/ui/ServicesTab';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The catalogue (specs/001-foundation, US3): what the laundry treats, what it does to it, through
// which steps, and what it charges.
export const Route = createFileRoute('/_app/pressing/catalogue')({
  loader: () => fetchCatalog(),
  component: CatalogPage,
});

type TabKey = 'services' | 'prices' | 'packs' | 'articles' | 'steps';

function CatalogPage() {
  const { me } = Route.useRouteContext();
  const catalog = Route.useLoaderData();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>('services');
  if (!catalog) return <EmptyState title={m.error_not_allowed()} />;
  const editable = can(me, 'catalog:manage');
  const onChanged = () => router.invalidate();
  return (
    <>
      <PageHeader title={m.nav_catalog()} description={m.catalog_description()} />
      <Tabs
        label={m.nav_catalog()}
        current={tab}
        onSelect={(key) => setTab(key as TabKey)}
        items={[
          { key: 'services', label: m.catalog_tab_services(), count: catalog.services.length },
          { key: 'prices', label: m.catalog_tab_prices() },
          { key: 'packs', label: m.catalog_tab_packs(), count: catalog.packs.length },
          { key: 'articles', label: m.catalog_tab_articles(), count: catalog.articles.length },
          { key: 'steps', label: m.catalog_tab_steps(), count: catalog.steps.length },
        ]}
      />
      {tab === 'services' && (
        <ServicesTab catalog={catalog} editable={editable} onChanged={onChanged} />
      )}
      {tab === 'prices' && <PricesTab catalog={catalog} editable={editable} onChanged={onChanged} />}
      {tab === 'packs' && <PacksTab catalog={catalog} editable={editable} onChanged={onChanged} />}
      {tab === 'articles' && (
        <NamesTab
          label={m.catalog_tab_articles()}
          addLabel={m.catalog_add_article()}
          emptyTitle={m.catalog_no_article()}
          items={catalog.articles.map((a) => ({ id: a.articleId, name: a.name, active: a.active }))}
          editable={editable}
          onChanged={onChanged}
          save={({ id, name, active }) =>
            saveArticle({ data: { ...(id ? { articleId: id } : {}), name, active } })
          }
        />
      )}
      {tab === 'steps' && (
        <NamesTab
          label={m.catalog_tab_steps()}
          addLabel={m.catalog_add_step()}
          emptyTitle={m.catalog_no_step()}
          items={catalog.steps.map((s) => ({ id: s.stepId, name: s.name, active: s.active }))}
          editable={editable}
          onChanged={onChanged}
          save={({ id, name, active }) =>
            saveStep({ data: { ...(id ? { stepId: id } : {}), name, active } })
          }
        />
      )}
    </>
  );
}
