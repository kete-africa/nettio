import { Button, DataTable, Drawer, EmptyState, PageHeader, Tag, TextField } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { Site, SiteKind } from '@/features/business';
import { processes } from '@/features/business/domain/sites';
import { fetchBusiness, saveSite } from '@/features/business/functions';
import { failure } from '@/lib/errors';
import { CheckField, ErrorNote, SelectField } from '@/lib/fields';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The sites of the laundry: where deposits are received, where they are processed, and which
// counter sends to which plant.
export const Route = createFileRoute('/_app/pressing/points')({
  loader: () => fetchBusiness(),
  component: SitesPage,
});

type Draft = Omit<Site, 'siteId'> & { siteId?: string };

const kindWords: Record<SiteKind, () => string> = {
  counter_plant: m.site_kind_counter_plant,
  counter: m.site_kind_counter,
  plant: m.site_kind_plant,
};

function SitesPage() {
  const { me } = Route.useRouteContext();
  const business = Route.useLoaderData();
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!business) return <EmptyState title={m.error_not_allowed()} />;
  const editable = can(me, 'settings:manage');
  const { sites } = business;
  const plants = sites.filter(
    (site) => site.active && processes(site.kind) && site.siteId !== draft?.siteId,
  );
  const open = (site?: Site) => {
    setError(null);
    setDraft(
      site
        ? { ...site }
        : { name: '', code: '', kind: 'counter_plant', plantSiteId: null, active: true },
    );
  };

  async function submit() {
    if (!draft) return;
    setBusy(true);
    try {
      const outcome = await saveSite({
        data: { ...draft, plantSiteId: draft.kind === 'counter' ? draft.plantSiteId : null },
      });
      setError(failure(outcome));
      if (outcome.ok) {
        setDraft(null);
        await router.invalidate();
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={m.nav_sites()}
        description={m.sites_description()}
        actions={editable ? <Button onClick={() => open()}>{m.sites_add()}</Button> : undefined}
      />
      <DataTable
        caption={m.nav_sites()}
        rows={sites}
        rowKey={(site) => site.siteId}
        {...(editable ? { onRowClick: (site: Site) => open(site) } : {})}
        columns={[
          { key: 'name', label: m.field_name(), render: (site) => site.name },
          { key: 'code', label: m.site_code(), render: (site) => site.code },
          { key: 'kind', label: m.site_kind(), render: (site) => kindWords[site.kind]() },
          {
            key: 'plant',
            label: m.site_plant(),
            render: (site) => sites.find((other) => other.siteId === site.plantSiteId)?.name ?? '',
          },
          {
            key: 'state',
            label: m.field_state(),
            render: (site) =>
              site.active ? <Tag tone="validated">{m.state_active()}</Tag> : <Tag>{m.state_retired()}</Tag>,
          },
        ]}
      />
      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.siteId ? m.sites_change() : m.sites_add()}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button
              disabled={busy || !draft?.name.trim() || !/^[A-Z]{1,3}$/.test(draft?.code ?? '')}
              onClick={() => void submit()}
            >
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <TextField
              label={m.site_name()}
              value={draft.name}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <TextField
              label={m.site_code()}
              hint={m.site_code_hint()}
              value={draft.code}
              maxLength={3}
              onChange={(event) => setDraft({ ...draft, code: event.target.value.toUpperCase() })}
            />
            <SelectField
              label={m.site_kind()}
              value={draft.kind}
              onChange={(event) => setDraft({ ...draft, kind: event.target.value as SiteKind })}
              options={(Object.keys(kindWords) as SiteKind[]).map((value) => ({
                value,
                label: kindWords[value](),
              }))}
            />
            {draft.kind === 'counter' && (
              <SelectField
                label={m.site_plant()}
                hint={m.site_plant_hint()}
                value={draft.plantSiteId ?? ''}
                onChange={(event) => setDraft({ ...draft, plantSiteId: event.target.value || null })}
                options={[
                  { value: '', label: m.site_plant_none() },
                  ...plants.map((site) => ({ value: site.siteId, label: site.name })),
                ]}
              />
            )}
            <CheckField
              label={m.state_active()}
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
