import { FeedbackButton } from '@kete/feedback/button';
import { applyTheme, ThemeChoice, type ThemeChoiceValue } from '@kete/design';
import { Link } from '@tanstack/react-router';
import { useEffect, useState, type ReactNode } from 'react';
import * as m from '@/paraglide/messages.js';

async function sendFeedback(input: object): Promise<void> {
  const response = await fetch('/api/avis', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error(`feedback: ${response.status}`);
}

/** The frame of every signed-in screen: the app, its sections, the feedback button. */
export function AppShell({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeChoiceValue>('auto');
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme');
    if (current === 'dark' || current === 'light' || current === 'auto') setTheme(current);
  }, []);
  return (
    <div className="min-h-dvh bg-canvas text-fg">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/taches" className="font-heading text-title font-semibold">
            {m.app_name()}
          </Link>
          <nav className="flex gap-4">
            <Link to="/taches" className="text-body-sm font-semibold text-fg-muted hover:text-fg">
              {m.nav_tasks()}
            </Link>
            <Link to="/journal" className="text-body-sm font-semibold text-fg-muted hover:text-fg">
              {m.nav_journal()}
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-3">
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
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-6">{children}</main>
    </div>
  );
}
