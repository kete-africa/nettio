import { createFileRoute, redirect } from '@tanstack/react-router';
import { fetchMe } from '@/features/business/functions';
import { LegalLinks } from '@/lib/legal';
import * as m from '@/paraglide/messages.js';

// The front door (specs/030-standalone). Someone signed in goes to her day; anyone else reads
// what Nettio is — and what it never does — before she comes in with her Compte Kete.
export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (await fetchMe()) throw redirect({ to: '/aujourdhui' });
  },
  component: Landing,
});

const action =
  'inline-flex h-(--control-height) items-center justify-center rounded-control px-(--control-padding) font-semibold';

function Landing() {
  const blocks: [() => string, () => string][] = [
    [m.landing_counter_title, m.landing_counter_body],
    [m.landing_money_title, m.landing_money_body],
    [m.landing_workshop_title, m.landing_workshop_body],
    [m.landing_ask_title, m.landing_ask_body],
  ];
  return (
    <main className="mx-auto flex min-h-dvh max-w-[960px] flex-col gap-8 bg-canvas px-4 py-10 font-ui text-body text-fg">
      <p className="font-heading text-title font-semibold">{m.app_name()}</p>
      <header className="flex flex-col gap-4">
        <h1 className="max-w-[20ch] font-heading text-[34px] leading-tight font-semibold">{m.landing_title()}</h1>
        <p className="max-w-prose text-fg-muted">{m.landing_lead()}</p>
        <div className="flex flex-wrap gap-3">
          <a className={`${action} bg-action text-on-action hover:bg-action-strong`} href="/auth/connexion?returnTo=%2Fdemarrage">
            {m.landing_start()}
          </a>
          <a className={`${action} border border-line-control bg-surface-control text-fg hover:bg-surface-hover`} href="/auth/connexion">
            {m.landing_sign_in()}
          </a>
        </div>
        <p className="max-w-prose text-body-sm text-fg-muted">{m.landing_how()}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {blocks.map(([title, body]) => (
          <li key={title()} className="rounded-box border border-line bg-surface p-5">
            <h2 className="font-heading text-title font-semibold">{title()}</h2>
            <p className="mt-2 text-fg-muted">{body()}</p>
          </li>
        ))}
      </ul>
      <section className="rounded-box border border-line bg-surface p-5">
        <h2 className="font-heading text-title font-semibold">{m.landing_rules_title()}</h2>
        <p className="mt-2 max-w-prose">{m.landing_rules_body()}</p>
      </section>
      <p className="text-body-sm text-fg-muted">{m.landing_subscription()}</p>
      <LegalLinks />
    </main>
  );
}
