import { FeedbackButton } from '@kete/feedback/button';
import {
  applyTheme,
  Icon,
  navItemClassName,
  NavSection,
  Shell,
  TabBar,
  TabBarItem,
  ThemeChoice,
  type IconName,
  type ThemeChoiceValue,
} from '@kete/design';
import { Link, useLocation, useNavigate, type LinkProps } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import type { Me } from '@/features/business/functions';
import { AssistantLauncher, AssistantProvider, HeldPermissions } from '@/features/assistant/ui/Assistant';
import { PendingDeposits } from '@/features/device/ui/PendingDeposits';
import { PersonSwitch } from '@/features/manager/ui/PersonSwitch';
import * as m from '@/paraglide/messages.js';
import { can } from './signed-in';

async function sendFeedback(input: object): Promise<void> {
  const response = await fetch('/api/avis', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`feedback: ${response.status}`);
}

interface Entry {
  /** The phone's raised round tab: the gesture of the trade. */
  primary?: boolean;
  to: NonNullable<LinkProps['to']>;
  icon: IconName;
  label: () => string;
  /** The permission that opens it; none means anyone signed in. */
  permission?: string;
}

interface Section {
  label: () => string;
  entries: Entry[];
}

/** Every place of Nettio, by section: a person only sees the ones she may open. */
const sections: Section[] = [
  {
    label: m.nav_section_counter,
    entries: [
      { to: '/aujourdhui', icon: 'home', label: m.nav_today },
      { to: '/depots/nouveau', icon: 'new', label: m.nav_new_order, permission: 'orders:create' },
      { to: '/depots', icon: 'list', label: m.nav_orders, permission: 'orders:read' },
      { to: '/clients', icon: 'people', label: m.nav_customers, permission: 'customers:read' },
      { to: '/demander', icon: 'sparkle', label: m.nav_ask, permission: 'assistant:ask' },
    ],
  },
  {
    label: m.nav_section_workshop,
    entries: [
      { to: '/atelier', icon: 'tool', label: m.nav_workshop, permission: 'workshop:operate' },
      { to: '/livraisons', icon: 'send', label: m.nav_delivery, permission: 'delivery:read' },
    ],
  },
  {
    label: m.nav_section_money,
    entries: [
      { to: '/argent/caisse', icon: 'columns', label: m.nav_till, permission: 'cash:operate' },
      { to: '/argent/depenses', icon: 'file', label: m.nav_expenses, permission: 'expenses:read' },
      { to: '/argent/resultat', icon: 'chart', label: m.nav_result, permission: 'money:read' },
      { to: '/argent/couts', icon: 'layers', label: m.nav_costs, permission: 'money:read' },
      { to: '/factures', icon: 'file', label: m.nav_invoices, permission: 'invoices:read' },
      { to: '/devis', icon: 'file', label: m.nav_quotes, permission: 'quotes:read' },
    ],
  },
  {
    label: m.nav_section_business,
    entries: [
      { to: '/pressing/schema', icon: 'apps', label: m.nav_diagram, permission: 'business:read' },
      {
        to: '/pressing/catalogue',
        icon: 'library',
        label: m.nav_catalog,
        permission: 'business:read',
      },
      { to: '/pressing/points', icon: 'flag', label: m.nav_sites, permission: 'business:read' },
      { to: '/pressing/reseau', icon: 'layers', label: m.nav_network, permission: 'transfers:read' },
      { to: '/pressing/stock', icon: 'library', label: m.nav_stock, permission: 'stock:read' },
      { to: '/pressing/equipe', icon: 'people', label: m.nav_team, permission: 'staff:manage' },
      { to: '/pressing/travail', icon: 'chart', label: m.nav_work, permission: 'pay:read' },
      { to: '/pressing/gerant', icon: 'flag', label: m.nav_manager, permission: 'approvals:request' },
      { to: '/pressing/messages', icon: 'send', label: m.nav_messages, permission: 'messages:read' },
      { to: '/pressing/releve', icon: 'clock', label: m.nav_statement, permission: 'statement:send' },
      {
        to: '/pressing/reglages',
        icon: 'tool',
        label: m.nav_settings,
        permission: 'settings:manage',
      },
      { to: '/journal', icon: 'clock', label: m.nav_journal, permission: 'journal:read' },
      { to: '/pressing/appareil', icon: 'tool', label: m.nav_device },
      { to: '/aide', icon: 'library', label: m.nav_help },
    ],
  },
];

/** The places a phone keeps under the thumb; the rest is behind the menu. */
const tabs: Entry[] = [
  { to: '/aujourdhui', icon: 'home', label: m.nav_today },
  { to: '/depots', icon: 'list', label: m.nav_orders, permission: 'orders:read' },
  {
    to: '/depots/nouveau',
    icon: 'plus',
    label: m.nav_new_order_short,
    permission: 'orders:create',
    primary: true,
  },
  { to: '/atelier', icon: 'tool', label: m.nav_workshop, permission: 'workshop:operate' },
  { to: '/livraisons', icon: 'send', label: m.nav_delivery_short, permission: 'delivery:run' },
  { to: '/argent/caisse', icon: 'columns', label: m.nav_till, permission: 'cash:operate' },
  { to: '/argent/resultat', icon: 'chart', label: m.nav_result, permission: 'money:read' },
];

/** The frame of every signed-in screen: the laundry, the places she may open, her tools. */
export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeChoiceValue>('auto');
  const { pathname } = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark' || current === 'light' || current === 'auto') setTheme(current);
  }, []);
  const open = (entry: Entry) => !entry.permission || can(me, entry.permission);
  // The longest address that matches: « Nouveau dépôt » is not « Dépôts ».
  const all = [...sections.flatMap((section) => section.entries), ...tabs].map((entry) => entry.to);
  const best = all
    .filter((to) => pathname === to || pathname.startsWith(`${to}/`))
    .sort((a, b) => b.length - a.length)[0];
  const isCurrent = (to: Entry['to']) => to === best;
  // Before the laundry is set up there is nowhere to go but its start.
  const visible = me.business
    ? sections
        .map((section) => ({ ...section, entries: section.entries.filter(open) }))
        .filter((section) => section.entries.length > 0)
    : [];
  // Five places at most under the thumb; the rest is in the menu.
  const phone = me.business ? tabs.filter(open).slice(0, 5) : [];
  return (
    <HeldPermissions value={me.permissions}>
    <AssistantProvider>
    <Shell
      brand={me.business?.businessName ?? m.app_name()}
      navLabel={m.nav_label()}
      showNavLabel={m.nav_show()}
      hideNavLabel={m.nav_hide()}
      nav={visible.map((section) => (
        <NavSection key={section.label()} label={section.label()}>
          {section.entries.map((entry) => (
            <li key={entry.to}>
              <Link
                to={entry.to}
                aria-current={isCurrent(entry.to) ? 'page' : undefined}
                className={navItemClassName(isCurrent(entry.to))}
              >
                <span className="inline-flex shrink-0">
                  <Icon name={entry.icon} />
                </span>
                <span className="min-w-0 flex-1 truncate">{entry.label()}</span>
              </Link>
            </li>
          ))}
        </NavSection>
      ))}
      footer={
        <div className="flex flex-col gap-3">
          <p className="truncate text-body-sm text-fg-muted">{me.name}</p>
          {me.onDeviceOf && (
            <p className="text-body-sm text-fg-muted">{m.switch_on_device_of({ name: me.onDeviceOf })}</p>
          )}
          {me.business && <PersonSwitch />}
          <ThemeChoice
            label={m.theme_label()}
            value={theme}
            onChange={(choice) => {
              setTheme(choice);
              applyTheme(choice);
            }}
            labels={{ dark: m.theme_dark(), light: m.theme_light(), auto: m.theme_auto() }}
          />
          <a href="/auth/sortie" className="text-body-sm text-link underline">
            {m.nav_sign_out()}
          </a>
        </div>
      }
      toolbar={
        <span className="flex items-center gap-2">
          {me.business && can(me, 'assistant:ask') && <AssistantLauncher />}
          <FeedbackButton
          labels={{
            open: m.feedback_open(),
            title: m.feedback_title(),
            kinds: {
              problem: m.feedback_problem(),
              idea: m.feedback_idea(),
              praise: m.feedback_praise(),
            },
            kindsLabel: m.feedback_kind(),
            message: m.feedback_message(),
            send: m.feedback_send(),
            close: m.feedback_close(),
            thanks: m.feedback_thanks(),
            error: m.feedback_error(),
          }}
          onSubmit={sendFeedback}
          />
        </span>
      }
      tabBar={
        phone.length > 1 ? (
          <TabBar label={m.nav_label()}>
            {phone.map((entry) => (
              <TabBarItem
                key={entry.to}
                icon={entry.icon}
                primary={entry.primary ?? false}
                current={isCurrent(entry.to)}
                onClick={() => void navigate({ to: entry.to })}
              >
                {entry.label()}
              </TabBarItem>
            ))}
          </TabBar>
        ) : undefined
      }
    >
      {me.access.required && !me.access.active && (
        <p className="mb-4 rounded-control border border-state-verify bg-state-verify-surface px-3 py-2 text-body-sm text-state-verify-fg">
          {m.access_ended_banner()}
        </p>
      )}
      {me.business && <PendingDeposits />}
      {children}
    </Shell>
    </AssistantProvider>
    </HeldPermissions>
  );
}
