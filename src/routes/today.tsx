import { EmptyState, PageHeader, PageSection, Row, RowList } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import { fetchCatalog } from '@/features/catalog/functions';
import { formatDay } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// « Aujourd'hui » answers one question: where does my day stand. Until the counter opens
// (specs/002), it says what is still missing before it can.
export const Route = createFileRoute('/_app/aujourdhui')({
  loader: () => fetchCatalog(),
  component: TodayPage,
});

function TodayPage() {
  const { me } = Route.useRouteContext();
  const catalog = Route.useLoaderData();
  if (!me.role) {
    return <EmptyState title={m.today_no_role_title()}>{m.today_no_role_body()}</EmptyState>;
  }
  const gaps = catalog?.gaps;
  const missing = (gaps?.servicesWithoutPrice.length ?? 0) + (gaps?.packsWithoutService.length ?? 0);
  return (
    <>
      <PageHeader title={m.today_title()} description={formatDay(new Date())} />
      <PageSection first title={m.today_to_do()}>
        {missing === 0 ? (
          <EmptyState title={m.today_nothing_title()}>{m.today_nothing_body()}</EmptyState>
        ) : (
          <RowList label={m.today_to_do()}>
            {gaps && gaps.servicesWithoutPrice.length > 0 && (
              <Row
                href="/pressing/catalogue"
                title={m.today_services_without_price({ count: gaps.servicesWithoutPrice.length })}
                meta={gaps.servicesWithoutPrice.join(' · ')}
              />
            )}
            {gaps && gaps.packsWithoutService.length > 0 && (
              <Row
                href="/pressing/catalogue"
                title={m.today_packs_without_service({ count: gaps.packsWithoutService.length })}
                meta={gaps.packsWithoutService.join(' · ')}
              />
            )}
          </RowList>
        )}
      </PageSection>
      {can(me, 'business:read') && (
        <PageSection title={m.today_business()}>
          <RowList label={m.today_business()}>
            <Row href="/pressing/schema" title={m.nav_diagram()} meta={m.today_diagram_meta()} />
            <Row href="/pressing/catalogue" title={m.nav_catalog()} meta={m.today_catalog_meta()} />
          </RowList>
        </PageSection>
      )}
    </>
  );
}
