import {
  Button,
  Chip,
  ChipGroup,
  DataTable,
  Drawer,
  EmptyState,
  PageHeader,
  PageSection,
  Tag,
} from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { BusinessRole, StaffMember } from '@/features/business';
import { businessRoles } from '@/features/business/business.record';
import {
  fetchBusiness,
  fetchTeam,
  saveRolePermissions,
  saveStaffRole,
} from '@/features/business/functions';
import { failure } from '@/lib/errors';
import { CheckField, ErrorNote, Note, SelectField } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';

// The team and its rights (specs/001-foundation, US4): the owner gives each person a role and her
// sites, and ticks what each role may do.
export const Route = createFileRoute('/_app/pressing/equipe')({
  loader: async () => ({ team: await fetchTeam(), business: await fetchBusiness() }),
  component: TeamPage,
});

const roleWords: Record<BusinessRole, () => string> = {
  owner: m.role_owner,
  manager: m.role_manager,
  counter: m.role_counter,
  cashier: m.role_cashier,
  workshop: m.role_workshop,
  courier: m.role_courier,
  accountant: m.role_accountant,
};

function TeamPage() {
  const { team, business } = Route.useLoaderData();
  const router = useRouter();
  const [draft, setDraft] = useState<StaffMember | null>(null);
  const [role, setRole] = useState<BusinessRole>('manager');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!team) return <EmptyState title={m.error_not_allowed()} />;
  const sites = business?.sites.filter((site) => site.active) ?? [];
  const held = new Set(team.roles.find((entry) => entry.role === role)?.permissions ?? []);

  async function run(work: () => Promise<{ ok: boolean }>, after?: () => void) {
    setBusy(true);
    try {
      const outcome = await work();
      setError(failure(outcome as never));
      if (outcome.ok) {
        after?.();
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
      <PageHeader title={m.nav_team()} description={m.team_description()} />
      <DataTable
        caption={m.team_people()}
        rows={team.staff}
        rowKey={(person) => person.staffId}
        onRowClick={(person) => {
          setError(null);
          setDraft({ ...person });
        }}
        empty={<EmptyState title={m.team_empty()} />}
        columns={[
          { key: 'name', label: m.field_name(), render: (person) => person.name },
          {
            key: 'role',
            label: m.team_role(),
            render: (person) =>
              person.role ? roleWords[person.role]() : <Tag tone="verify">{m.team_waiting()}</Tag>,
          },
          {
            key: 'sites',
            label: m.nav_sites(),
            render: (person) =>
              person.siteIds.length === 0
                ? m.team_all_sites()
                : sites
                    .filter((site) => person.siteIds.includes(site.siteId))
                    .map((site) => site.name)
                    .join(' · '),
          },
          {
            key: 'state',
            label: m.field_state(),
            render: (person) =>
              person.active ? <Tag tone="validated">{m.state_active()}</Tag> : <Tag>{m.state_retired()}</Tag>,
          },
        ]}
      />
      <div className="mt-4">
        <Note>{m.team_invite_hint()}</Note>
      </div>

      <PageSection title={m.team_rights()}>
        <p className="mb-4 max-w-3xl text-fg-muted">{m.team_rights_description()}</p>
        <ChipGroup label={m.team_role()}>
          {businessRoles.map((entry) => (
            <Chip key={entry} pressed={entry === role} onClick={() => setRole(entry)}>
              {roleWords[entry]()}
            </Chip>
          ))}
        </ChipGroup>
        <div className="mt-4 rounded-box border border-line bg-surface px-4 py-2">
          {team.permissions.map((permission) => (
            <CheckField
              key={`${role}-${permission.name}`}
              label={permission.label}
              hint={permission.description}
              checked={held.has(permission.name)}
              disabled={busy || role === 'owner'}
              onChange={(checked) => {
                const next = new Set(held);
                if (checked) next.add(permission.name);
                else next.delete(permission.name);
                void run(() => saveRolePermissions({ data: { role, permissions: [...next] } }));
              }}
            />
          ))}
        </div>
        {role === 'owner' && <p className="mt-2 text-body-sm text-fg-muted">{m.team_owner_all()}</p>}
        {draft === null && (
          <div className="mt-3">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </PageSection>

      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.name ?? ''}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button
              disabled={busy}
              onClick={() =>
                draft &&
                void run(
                  () =>
                    saveStaffRole({
                      data: {
                        staffId: draft.staffId,
                        role: draft.role,
                        siteIds: draft.siteIds,
                        active: draft.active,
                      },
                    }),
                  () => setDraft(null),
                )
              }
            >
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <SelectField
              label={m.team_role()}
              value={draft.role ?? ''}
              onChange={(event) =>
                setDraft({ ...draft, role: (event.target.value || null) as BusinessRole | null })
              }
              options={[
                { value: '', label: m.team_no_role() },
                ...businessRoles.map((entry) => ({ value: entry, label: roleWords[entry]() })),
              ]}
            />
            <fieldset>
              <legend className="mb-1.5 text-body-sm font-semibold text-fg">{m.nav_sites()}</legend>
              <p className="text-body-sm text-fg-muted">{m.team_sites_hint()}</p>
              {sites.map((site) => (
                <CheckField
                  key={site.siteId}
                  label={`${site.name} (${site.code})`}
                  checked={draft.siteIds.includes(site.siteId)}
                  onChange={(checked) =>
                    setDraft({
                      ...draft,
                      siteIds: checked
                        ? [...draft.siteIds, site.siteId]
                        : draft.siteIds.filter((id) => id !== site.siteId),
                    })
                  }
                />
              ))}
            </fieldset>
            <CheckField
              label={m.state_active()}
              hint={m.team_active_hint()}
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
