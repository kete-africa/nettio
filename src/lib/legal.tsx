import type { ReactNode } from 'react';
import { formatDay } from '@/lib/format';
import * as m from '@/paraglide/messages.js';
import type { Publisher } from './publisher';

const link = 'font-semibold text-fg-link underline';

/** The frame of a public page: no shell, no session — anyone may read it. */
export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[720px] flex-col gap-6 bg-canvas px-4 py-8 font-ui text-body text-fg">
      <p>
        <a className={link} href="/">
          {m.app_name()}
        </a>
      </p>
      <h1 className="font-heading text-[28px] leading-tight font-semibold">{title}</h1>
      {children}
      <LegalLinks />
    </main>
  );
}

export function LegalLinks() {
  return (
    <nav aria-label={m.legal_notice()} className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-4 text-body-sm">
      <a className={link} href="/mentions-legales">
        {m.legal_notice()}
      </a>
      <a className={link} href="/confidentialite">
        {m.legal_privacy()}
      </a>
      <a className={link} href="/conditions">
        {m.legal_terms()}
      </a>
    </nav>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-title font-semibold">{title}</h2>
      <p className="max-w-prose">{children}</p>
    </section>
  );
}

/** Who publishes: each line as the deployment says it — or, plainly, that it is not said yet. */
export function PublisherFacts({ publisher }: { publisher: Publisher }) {
  const lines: [string, string][] = [
    [m.legal_publisher(), publisher.name],
    [m.legal_address(), publisher.address],
    [m.legal_registration(), publisher.registration],
    [m.legal_contact(), publisher.email],
    [m.legal_host(), publisher.host],
  ];
  return (
    <dl className="flex flex-col gap-2">
      {lines.map(([label, value]) => (
        <div key={label} className="flex flex-wrap gap-x-3">
          <dt className="w-40 shrink-0 text-fg-muted">{label}</dt>
          <dd className={value ? 'font-semibold' : 'text-fg-muted'}>{value || m.legal_to_complete()}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Updated({ publisher }: { publisher: Publisher }) {
  if (!publisher.updatedOn) return null;
  return <p className="text-body-sm text-fg-muted">{m.legal_updated({ date: formatDay(publisher.updatedOn) })}</p>;
}
