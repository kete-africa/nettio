import { EmptyState, PageHeader, PageSection, Row, RowList } from '@kete/design';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useCallback } from 'react';
import { businessFlow } from '@/features/business/domain/flow';
import { flowWords } from '@/features/business/flow-words';
import { fetchBusiness } from '@/features/business/functions';
import { FlowDiagram } from '@/features/business/ui/FlowDiagram';
import { fetchCatalog } from '@/features/catalog/functions';
import * as m from '@/paraglide/messages.js';

// The diagram of the laundry (specs/001-foundation, US2): drawn from its settings, redrawn at each
// change. Its text equivalent — every route as a sentence — sits under it.
export const Route = createFileRoute('/_app/pressing/schema')({
  loader: async () => ({ business: await fetchBusiness(), catalog: await fetchCatalog() }),
  component: DiagramPage,
});

function DiagramPage() {
  const { business, catalog } = Route.useLoaderData();
  const navigate = useNavigate();
  const flowFor = useCallback(
    (perRow: number) =>
      businessFlow({
        sites: business?.sites ?? [],
        services: catalog?.services ?? [],
        steps: catalog?.steps ?? [],
        words: flowWords(),
        perRow,
      }),
    [business, catalog],
  );
  if (!business || !catalog) return <EmptyState title={m.error_not_allowed()} />;
  const stepNames = new Map(catalog.steps.map((step) => [step.stepId, step.name]));
  return (
    <>
      <PageHeader title={m.diagram_title()} description={m.diagram_description()} />
      <FlowDiagram
        flowFor={flowFor}
        label={m.diagram_title()}
        onOpen={(target) =>
          void navigate({ to: target.type === 'site' ? '/pressing/points' : '/pressing/catalogue' })
        }
      />
      <PageSection title={m.flow_routes()}>
        <RowList label={m.flow_routes()}>
          {catalog.services
            .filter((service) => service.active)
            .map((service) => (
              <Row
                key={service.serviceId}
                href="/pressing/catalogue"
                title={service.name}
                meta={
                  service.stepIds.length > 0
                    ? service.stepIds.map((stepId) => stepNames.get(stepId)).join(' → ')
                    : m.flow_direct()
                }
              />
            ))}
        </RowList>
      </PageSection>
    </>
  );
}
