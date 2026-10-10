import { PageHeader, PageSection } from '@kete/design';
import { createFileRoute } from '@tanstack/react-router';
import type { BusinessRole } from '@/features/business';
import { formatDay } from '@/lib/format';
import { LegalLinks } from '@/lib/legal';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// Help by role, the subscription, and the laundry's data (specs/030-standalone).
export const Route = createFileRoute('/_app/aide')({
  component: HelpPage,
});

const help: Record<BusinessRole, { title: () => string; steps: (() => string)[] }> = {
  owner: { title: m.help_role_owner, steps: [m.help_owner_1, m.help_owner_2, m.help_owner_3, m.help_owner_4, m.help_owner_5] },
  manager: { title: m.help_role_manager, steps: [m.help_manager_1, m.help_manager_2, m.help_manager_3, m.help_manager_4] },
  counter: { title: m.help_role_counter, steps: [m.help_counter_1, m.help_counter_2, m.help_counter_3, m.help_counter_4] },
  cashier: { title: m.help_role_cashier, steps: [m.help_cashier_1, m.help_cashier_2, m.help_cashier_3] },
  workshop: { title: m.help_role_workshop, steps: [m.help_workshop_1, m.help_workshop_2, m.help_workshop_3] },
  courier: { title: m.help_role_courier, steps: [m.help_courier_1, m.help_courier_2, m.help_courier_3] },
  accountant: { title: m.help_role_accountant, steps: [m.help_accountant_1, m.help_accountant_2] },
};

function Steps({ role }: { role: BusinessRole }) {
  return (
    <ol className="flex max-w-3xl list-decimal flex-col gap-2 pl-5">
      {help[role].steps.map((step) => (
        <li key={step()}>{step()}</li>
      ))}
    </ol>
  );
}

function HelpPage() {
  const { me } = Route.useRouteContext();
  const mine = me.role;
  const others = (Object.keys(help) as BusinessRole[]).filter((role) => role !== mine);
  const owner = can(me, 'settings:manage');
  return (
    <>
      <PageHeader title={m.help_title()} description={m.help_description()} />
      {mine && (
        <PageSection first title={`${m.help_your_role()} : ${help[mine].title()}`}>
          <Steps role={mine} />
        </PageSection>
      )}
      <PageSection first={!mine} title={m.help_other_roles()}>
        <div className="flex flex-col gap-2">
          {others.map((role) => (
            <details key={role} className="rounded-box border border-line bg-surface px-4 py-3">
              <summary className="cursor-pointer font-semibold">{help[role].title()}</summary>
              <div className="mt-3">
                <Steps role={role} />
              </div>
            </details>
          ))}
        </div>
      </PageSection>
      {owner && (
        <PageSection title={m.access_title()}>
          <p>{me.access.until ? m.access_until({ date: formatDay(me.access.until) }) : m.access_none()}</p>
          {me.access.accountUrl && (
            <p className="mt-2">
              <a className="font-semibold text-fg-link underline" href={me.access.accountUrl} target="_blank" rel="noopener noreferrer">
                {m.access_manage()}
              </a>
            </p>
          )}
        </PageSection>
      )}
      {can(me, 'data:export') && (
        <PageSection title={m.help_data_title()}>
          <p className="max-w-3xl">{m.help_data_body()}</p>
          <p className="mt-3">
            <a
              className="inline-flex h-(--control-height) items-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover"
              href="/api/export"
              download
            >
              {m.help_export()}
            </a>
          </p>
        </PageSection>
      )}
      <LegalLinks />
    </>
  );
}
