import { Button, EmptyState, PageHeader, PageSection, Tag, TextField, type TagTone } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { SendingOutcome, StatementChannel } from '@/features/assistant/domain/sending';
import { fetchDelivery, saveDelivery, sendStatementNow } from '@/features/assistant/functions';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote, Note, SelectField } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';

// The evening statement sent by itself (specs/013-statement-sent): on or off, its hour, where it
// leaves to, and what its last sending became. Whoever receives it reads the laundry's money.
export const Route = createFileRoute('/_app/pressing/releve')({
  loader: () => fetchDelivery(),
  component: StatementPage,
});

const channelWords: Record<StatementChannel, () => string> = {
  email: m.channel_email,
  whatsapp: m.channel_whatsapp,
  telegram: m.channel_telegram,
};
const statusWords: Record<SendingOutcome['status'], () => string> = {
  sent: m.delivery_status_sent,
  failed: m.delivery_status_failed,
  not_connected: m.delivery_status_not_connected,
};
const statusTones: Record<SendingOutcome['status'], TagTone> = {
  sent: 'validated',
  failed: 'error',
  not_connected: 'neutral',
};
const reasonWords: Record<string, () => string> = {
  outside_window: m.message_reason_outside_window,
  recipient_unreachable: m.message_reason_recipient_unreachable,
  provider_refused: m.message_reason_provider_refused,
  network: m.message_reason_network,
};
const hours = Array.from({ length: 24 }, (_, hour) => hour);

function Outcome({ outcome }: { outcome: SendingOutcome[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {outcome.map((entry) => (
        <li key={entry.channel} className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{channelWords[entry.channel]()}</span>
          <Tag tone={statusTones[entry.status]}>{statusWords[entry.status]()}</Tag>
          {entry.reason && (
            <span className="text-body-sm text-fg-muted">
              {(reasonWords[entry.reason] ?? m.message_reason_network)()}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function StatementPage() {
  const view = Route.useLoaderData();
  const router = useRouter();
  const [enabled, setEnabled] = useState(view?.delivery.enabled ?? false);
  const [hour, setHour] = useState(String(view?.delivery.hour ?? 20));
  const [language, setLanguage] = useState<'fr' | 'en'>(view?.delivery.language ?? 'fr');
  const [email, setEmail] = useState(view?.delivery.email ?? '');
  const [whatsapp, setWhatsapp] = useState(view?.delivery.whatsapp ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [sentNow, setSentNow] = useState<SendingOutcome[] | null>(null);
  if (!view) return <EmptyState title={m.error_not_allowed()} />;
  const { delivery, connected } = view;

  async function run<T>(
    work: () => Promise<{ ok: true; output: T } | { ok: false; code: string }>,
    after: (output: T) => void,
  ) {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        await router.invalidate();
        after(outcome.output);
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const save = (unlinkTelegram = false) =>
    run(
      () =>
        saveDelivery({
          data: { enabled, hour: Number(hour), language, email: email.trim(), whatsapp, unlinkTelegram },
        }),
      (output) =>
        setSaid(output.enabled ? m.delivery_saved_on({ hour: output.hour }) : m.delivery_saved_off()),
    );

  return (
    <>
      <PageHeader title={m.delivery_title()} description={m.delivery_description()} />
      <div className="mb-6 flex flex-col gap-3" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>

      <PageSection first title={m.delivery_when()}>
        <div className="flex max-w-xl flex-col gap-4">
          <CheckField label={m.delivery_enabled()} hint={m.delivery_enabled_hint()} checked={enabled} onChange={setEnabled} />
          <SelectField
            label={m.delivery_hour()}
            hint={m.delivery_hour_hint()}
            value={hour}
            options={hours.map((value) => ({
              value: String(value),
              label: m.delivery_hour_value({ hour: value }),
            }))}
            onChange={(event) => setHour(event.target.value)}
          />
          <SelectField
            label={m.delivery_language()}
            value={language}
            options={[
              { value: 'fr', label: m.language_fr() },
              { value: 'en', label: m.language_en() },
            ]}
            onChange={(event) => setLanguage(event.target.value === 'en' ? 'en' : 'fr')}
          />
        </div>
      </PageSection>

      <PageSection title={m.delivery_where()}>
        <p className="mb-4 max-w-3xl text-body-sm text-fg-muted">{m.delivery_where_hint()}</p>
        <div className="flex max-w-xl flex-col gap-5">
          <div className="flex flex-col gap-2">
            <TextField
              label={m.delivery_email()}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            {!connected.email && <Tag tone="neutral">{m.delivery_not_connected({ channel: m.channel_email() })}</Tag>}
          </div>
          <div className="flex flex-col gap-2">
            <TextField
              label={m.delivery_whatsapp()}
              hint={m.delivery_whatsapp_hint()}
              type="tel"
              inputMode="tel"
              value={whatsapp}
              onChange={(event) => setWhatsapp(event.target.value)}
            />
            {!connected.whatsapp && (
              <Tag tone="neutral">{m.delivery_not_connected({ channel: m.channel_whatsapp() })}</Tag>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-body-sm font-semibold text-fg">{m.channel_telegram()}</span>
            {delivery.telegramLinked ? (
              <div className="flex flex-wrap items-center gap-3">
                <Tag tone="validated">{m.delivery_telegram_linked()}</Tag>
                <Button variant="secondary" disabled={busy} onClick={() => void save(true)}>
                  {m.delivery_telegram_unlink()}
                </Button>
              </div>
            ) : view.telegramLink ? (
              <>
                <p className="text-body-sm text-fg-muted">{m.delivery_telegram_hint()}</p>
                <a
                  className="inline-flex h-(--control-height) w-fit items-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={view.telegramLink}
                >
                  {m.delivery_telegram_open()}
                </a>
              </>
            ) : (
              <Tag tone="neutral">{m.delivery_not_connected({ channel: m.channel_telegram() })}</Tag>
            )}
          </div>
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button disabled={busy} onClick={() => void save()}>
            {m.delivery_save()}
          </Button>
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => sendStatementNow(),
                (output) => setSentNow(output.outcome),
              )
            }
          >
            {m.delivery_send_now()}
          </Button>
        </div>
        {sentNow && (
          <div className="mt-4 rounded-box border border-line bg-surface p-4" aria-live="polite">
            <p className="mb-2 font-semibold">{m.delivery_sent_now()}</p>
            <Outcome outcome={sentNow} />
          </div>
        )}
      </PageSection>

      <PageSection title={m.delivery_last()}>
        {delivery.lastSentOn ? (
          <div className="rounded-box border border-line bg-surface p-4">
            <p className="mb-2 text-body-sm text-fg-muted">{m.delivery_last_on({ day: delivery.lastSentOn })}</p>
            <Outcome outcome={delivery.lastOutcome} />
          </div>
        ) : (
          <p className="text-fg-muted">{m.delivery_never()}</p>
        )}
      </PageSection>
    </>
  );
}
