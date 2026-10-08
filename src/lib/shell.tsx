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
    entries: [{ to: '/aujourdhui', icon: 'home', label: m.nav_today }],
  },
  {
    label: m.nav_section_business,
    entries: [
      { to: '/pressing/schema', icon: 'chart', label: m.nav_diagram, permission: 'business:read' },
      {
        to: '/pressing/catalogue',
        icon: 'library',
        label: m.nav_catalog,
        permission: 'business:read',
      },
      { to: '/pressing/points', icon: 'flag', label: m.nav_sites, permission: 'business:read' },
      { to: '/pressing/equipe', icon: 'people', label: m.nav_team, permission: 'staff:manage' },
      {
        to: '/pressing/reglages',
        icon: 'tool',
        label: m.nav_settings,
        permission: 'settings:manage',
      },
      { to: '/journal', icon: 'clock', label: m.nav_journal, permission: 'journal:read' },
    ],
  },
];

/** The places a phone keeps under the thumb; the rest is behind the menu. */
const tabs: Entry[] = [
  { to: '/aujourdhui', icon: 'home', label: m.nav_today },
  { to: '/pressing/schema', icon: 'chart', label: m.nav_diagram, permission: 'business:read' },
  { to: '/pressing/catalogue', icon: 'library', label: m.nav_catalog, permission: 'business:read' },
  { to: '/pressing/equipe', icon: 'people', label: m.nav_team, permission: 'staff:manage' },
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
  const isCurrent = (to: Entry['to']) => pathname === to || pathname.startsWith(`${to}/`);
  // Before the laundry is set up there is nowhere to go but its start.
  const visible = me.business
    ? sections
        .map((section) => ({ ...section, entries: section.entries.filter(open) }))
        .filter((section) => section.entries.length > 0)
    : [];
  const phone = me.business ? tabs.filter(open) : [];
  return (
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
      }
      tabBar={
        phone.length > 1 ? (
          <TabBar label={m.nav_label()}>
            {phone.map((entry) => (
              <TabBarItem
                key={entry.to}
                icon={entry.icon}
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
      {children}
    </Shell>
  );
}
