import { Button, DataTable, Drawer, EmptyState, IconButton, Icon, Tag, TextField } from '@kete/design';
import { useState } from 'react';
import { failure } from '@/lib/errors';
import { CheckField, ErrorNote, SelectField } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';
import type { Catalog, Nature, Pricing, Service } from '../catalog.record';
import { saveService } from '../functions';

type Draft = Omit<Service, 'serviceId' | 'position'> & { serviceId?: string };

const blank: Draft = { name: '', nature: 'workshop', pricing: 'per_piece', active: true, stepIds: [] };

const natureWords: Record<Nature, () => string> = {
  workshop: m.nature_workshop,
  counter_only: m.nature_counter_only,
  logistics: m.nature_logistics,
};
const pricingWords: Record<Pricing, () => string> = {
  per_piece: m.pricing_per_piece,
  per_kg: m.pricing_per_kg,
};

/** The services and their routes: what the laundry does, and through which steps. */
export function ServicesTab({
  catalog,
  editable,
  onChanged,
}: {
  catalog: Catalog;
  editable: boolean;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stepNames = new Map(catalog.steps.map((step) => [step.stepId, step.name]));
  const routeOf = (service: Pick<Service, 'stepIds'>) =>
    service.stepIds.length > 0
      ? service.stepIds.map((stepId) => stepNames.get(stepId)).join(' → ')
      : m.flow_direct();
  const open = (service?: Service) => {
    setError(null);
    setDraft(service ? { ...service } : { ...blank });
  };
  const free = catalog.steps.filter(
    (step) => step.active && !(draft?.stepIds ?? []).includes(step.stepId),
  );

  async function submit() {
    if (!draft) return;
    setBusy(true);
    try {
      const outcome = await saveService({ data: draft });
      setError(failure(outcome));
      if (outcome.ok) {
        setDraft(null);
        await onChanged();
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const move = (index: number, by: -1 | 1) =>
    setDraft((current) => {
      if (!current) return current;
      const stepIds = [...current.stepIds];
      const [moved] = stepIds.splice(index, 1);
      if (moved) stepIds.splice(index + by, 0, moved);
      return { ...current, stepIds };
    });

  return (
    <>
      {editable && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => open()}>{m.catalog_add_service()}</Button>
        </div>
      )}
      <DataTable
        caption={m.catalog_tab_services()}
        rows={catalog.services}
        rowKey={(service) => service.serviceId}
        {...(editable ? { onRowClick: (service: Service) => open(service) } : {})}
        empty={<EmptyState title={m.catalog_no_service()} />}
        columns={[
          { key: 'name', label: m.field_name(), render: (service) => service.name },
          {
            key: 'pricing',
            label: m.service_pricing(),
            render: (service) =>
              service.nature === 'workshop'
                ? pricingWords[service.pricing]()
                : `${pricingWords[service.pricing]()} · ${natureWords[service.nature]()}`,
          },
          { key: 'route', label: m.service_route(), render: routeOf },
          {
            key: 'state',
            label: m.field_state(),
            render: (service) =>
              service.active ? (
                <Tag tone="validated">{m.state_active()}</Tag>
              ) : (
                <Tag>{m.state_retired()}</Tag>
              ),
          },
        ]}
      />
      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.serviceId ? m.catalog_change_service() : m.catalog_add_service()}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button disabled={busy || !draft?.name.trim()} onClick={() => void submit()}>
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <TextField
              label={m.field_name()}
              value={draft.name}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <SelectField
              label={m.service_nature()}
              value={draft.nature}
              onChange={(event) => {
                const nature = event.target.value as Nature;
                setDraft({ ...draft, nature, stepIds: nature === 'workshop' ? draft.stepIds : [] });
              }}
              options={(Object.keys(natureWords) as Nature[]).map((value) => ({
                value,
                label: natureWords[value](),
              }))}
            />
            <SelectField
              label={m.service_pricing()}
              value={draft.pricing}
              onChange={(event) => setDraft({ ...draft, pricing: event.target.value as Pricing })}
              options={(Object.keys(pricingWords) as Pricing[]).map((value) => ({
                value,
                label: pricingWords[value](),
              }))}
            />
            {draft.nature === 'workshop' && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1.5 text-body-sm font-semibold text-fg">
                  {m.service_route()}
                </legend>
                {draft.stepIds.length === 0 && (
                  <p className="text-body-sm text-fg-muted">{m.flow_direct()}</p>
                )}
                <ol className="flex flex-col gap-1.5">
                  {draft.stepIds.map((stepId, index) => (
                    <li
                      key={stepId}
                      className="flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-3"
                    >
                      <span className="font-number text-fg-muted">{index + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{stepNames.get(stepId)}</span>
                      <IconButton
                        label={m.route_move_up()}
                        disabled={index === 0}
                        onClick={() => move(index, -1)}
                      >
                        <span className="inline-flex rotate-180">
                          <Icon name="chevron" />
                        </span>
                      </IconButton>
                      <IconButton
                        label={m.route_move_down()}
                        disabled={index === draft.stepIds.length - 1}
                        onClick={() => move(index, 1)}
                      >
                        <Icon name="chevron" />
                      </IconButton>
                      <IconButton
                        label={m.route_remove()}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            stepIds: draft.stepIds.filter((other) => other !== stepId),
                          })
                        }
                      >
                        <Icon name="close" />
                      </IconButton>
                    </li>
                  ))}
                </ol>
                {free.length > 0 && (
                  <SelectField
                    label={m.route_add()}
                    value=""
                    onChange={(event) => {
                      if (event.target.value) {
                        setDraft({ ...draft, stepIds: [...draft.stepIds, event.target.value] });
                      }
                    }}
                    options={[
                      { value: '', label: m.route_choose() },
                      ...free.map((step) => ({ value: step.stepId, label: step.name })),
                    ]}
                  />
                )}
              </fieldset>
            )}
            <CheckField
              label={m.state_active()}
              hint={m.service_active_hint()}
              checked={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>
    </>
  );
}
