import { Button, EmptyState, PageHeader, PageSection, Tag, TextField, type TagTone } from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import type { Message, MessageKind, MessageStatus, MessageTemplate } from '@/features/messaging';
import { renderTemplate, type Placeholder } from '@/features/messaging/domain/messages';
import {
  fetchMessaging,
  remindSleeping,
  resendMessage,
  saveTemplate,
} from '@/features/messaging/functions';
import { errorSentence } from '@/lib/errors';
import { CheckField, ErrorNote, Note, TextAreaField } from '@/lib/fields';
import { formatDayTime } from '@/lib/format';
import { can } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// What the laundry writes to its customers (specs/006-messaging): each kind off until it turns it
// on, with its own words; the channels' state; and every message with its reason.
export const Route = createFileRoute('/_app/pressing/messages')({
  loader: () => fetchMessaging(),
  component: MessagesPage,
});

const kindWords: Record<Message['kind'], () => string> = {
  receipt: m.messages_kind_receipt,
  ready: m.messages_kind_ready,
  reminder: m.messages_kind_reminder,
  reply: m.messages_kind_reply,
  inbound: m.messages_kind_inbound,
};
const kindHints: Record<MessageKind, () => string> = {
  receipt: m.messages_kind_receipt_hint,
  ready: m.messages_kind_ready_hint,
  reminder: m.messages_kind_reminder_hint,
};
const statusWords: Record<MessageStatus, () => string> = {
  queued: m.message_status_queued,
  sent: m.message_status_sent,
  failed: m.message_status_failed,
  skipped: m.message_status_skipped,
  received: m.message_status_received,
};
const statusTones: Record<MessageStatus, TagTone> = {
  queued: 'verify',
  sent: 'validated',
  failed: 'error',
  skipped: 'neutral',
  received: 'info',
};
const reasonWords: Record<string, () => string> = {
  no_consent: m.message_reason_no_consent,
  no_channel: m.message_reason_no_channel,
  sms_not_connected: m.message_reason_sms_not_connected,
  telegram_not_linked: m.message_reason_telegram_not_linked,
  outside_window: m.message_reason_outside_window,
  recipient_unreachable: m.message_reason_recipient_unreachable,
  provider_refused: m.message_reason_provider_refused,
  network: m.message_reason_network,
};

function MessagesPage() {
  const { me } = Route.useRouteContext();
  const view = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!view) return <EmptyState title={m.error_not_allowed()} />;
  const editable = can(me, 'messages:manage');
  const sample: Record<Placeholder, string> = {
    client: m.messages_sample_customer(),
    numero: 'A-0412',
    contenu: m.messages_sample_content(),
    total: '5 400 F CFA',
    paye: '3 000 F CFA',
    reste: '2 400 F CFA',
    date: formatDayTime(new Date(Date.now() + 2 * 86_400_000)),
    pressing: me.business?.businessName ?? m.app_name(),
  };

  async function run(work: () => Promise<{ ok: true; output: unknown } | { ok: false; code: string }>, after?: (output: unknown) => void) {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        await router.invalidate();
        after?.(outcome.output);
      } else {
        setError(errorSentence(outcome.code));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={m.messages_title()} description={m.messages_description()} />
      <div className="mb-2 flex flex-wrap gap-2">
        {(['whatsapp', 'telegram'] as const).map((channel) => {
          const name = channel === 'whatsapp' ? m.channel_whatsapp() : m.channel_telegram();
          return view.channels[channel] ? (
            <Tag key={channel} tone="validated">
              {m.messages_channel_connected({ channel: name })}
            </Tag>
          ) : (
            <Tag key={channel} tone="neutral">
              {m.messages_channel_not_connected({ channel: name })}
            </Tag>
          );
        })}
      </div>
      {(!view.channels.whatsapp || !view.channels.telegram) && (
        <p className="mb-6 max-w-3xl text-body-sm text-fg-muted">{m.messages_not_connected_hint()}</p>
      )}
      <div className="flex flex-col gap-3" aria-live="polite">
        {said && <Note>{said}</Note>}
        <ErrorNote>{error}</ErrorNote>
      </div>

      {view.templates.map((template) => (
        <TemplateCard
          key={template.kind}
          template={template}
          proposed={view.defaults[template.kind]}
          placeholders={view.placeholders}
          sample={sample}
          editable={editable}
          busy={busy}
          onSave={(next) => void run(() => saveTemplate({ data: next }))}
        />
      ))}

      {editable && (
        <div className="mt-6">
          <Button
            variant="secondary"
            disabled={busy}
            onClick={() =>
              void run(
                () => remindSleeping(),
                (output) => {
                  const { queued, notSent } = output as { queued: number; notSent: number };
                  setSaid(m.messages_reminded({ queued, notSent }));
                },
              )
            }
          >
            {m.messages_remind()}
          </Button>
        </div>
      )}

      <PageSection title={m.messages_log()}>
        {view.messages.length === 0 ? (
          <p className="text-fg-muted">{m.messages_log_empty()}</p>
        ) : (
          <ul className="divide-y divide-line rounded-box border border-line bg-surface">
            {view.messages.map((message) => (
              <li key={message.messageId} className="flex flex-col gap-1.5 px-4 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">
                    {message.customerName}
                    {message.number ? ` · ${message.number}` : ''}
                  </span>
                  <span className="text-body-sm text-fg-muted">
                    {kindWords[message.kind]()} ·{' '}
                    {message.channel === 'telegram'
                      ? m.channel_telegram()
                      : message.channel === 'whatsapp'
                        ? m.channel_whatsapp()
                        : m.channel_none()}{' '}
                    · {formatDayTime(message.createdAt)}
                  </span>
                </p>
                <p className="text-body-sm whitespace-pre-line text-fg-muted">{message.body}</p>
                <p className="flex flex-wrap items-center gap-2">
                  <Tag tone={statusTones[message.status]}>{statusWords[message.status]()}</Tag>
                  {message.reason && (
                    <span className="text-body-sm text-fg-muted">
                      {(reasonWords[message.reason] ?? (() => message.reason))()}
                    </span>
                  )}
                  {message.status === 'queued' && !view.channels[message.channel as 'whatsapp' | 'telegram'] && (
                    <span className="text-body-sm text-fg-muted">{m.message_reason_channel_waiting()}</span>
                  )}
                  {editable && message.status === 'failed' && (
                    <Button
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void run(() => resendMessage({ data: { messageId: message.messageId } }))}
                    >
                      {m.messages_resend()}
                    </Button>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </PageSection>
    </>
  );
}

function TemplateCard({
  template,
  proposed,
  placeholders,
  sample,
  editable,
  busy,
  onSave,
}: {
  template: MessageTemplate;
  proposed: string;
  placeholders: string[];
  sample: Record<Placeholder, string>;
  editable: boolean;
  busy: boolean;
  onSave: (template: MessageTemplate) => void;
}) {
  const [enabled, setEnabled] = useState(template.enabled);
  // A kind the laundry never wrote starts from the words Nettio proposes; they are hers to change.
  const [body, setBody] = useState(template.body || proposed);
  const [providerTemplate, setProviderTemplate] = useState(template.providerTemplate);
  const changed =
    enabled !== template.enabled ||
    body !== (template.body || proposed) ||
    providerTemplate !== template.providerTemplate ||
    (enabled && !template.body);
  return (
    <section className="mt-6 rounded-box border border-line bg-surface p-5">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-title font-semibold">{kindWords[template.kind]()}</h2>
          <p className="text-body-sm text-fg-muted">{kindHints[template.kind]()}</p>
        </div>
        {template.enabled ? (
          <Tag tone="validated">{m.messages_state_on()}</Tag>
        ) : (
          <Tag tone="neutral">{m.messages_state_off()}</Tag>
        )}
      </header>
      <div className="flex flex-col gap-4">
        <CheckField label={m.messages_enabled()} checked={enabled} disabled={!editable} onChange={setEnabled} />
        <TextAreaField
          label={m.messages_body()}
          hint={m.messages_body_hint({ placeholders: placeholders.map((name) => `{${name}}`).join(' ') })}
          value={body}
          maxLength={1000}
          disabled={!editable}
          onChange={setBody}
        />
        <div>
          <p className="mb-1.5 text-body-sm font-semibold">{m.messages_preview()}</p>
          <p className="rounded-control bg-surface-selected px-3 py-2 text-body-sm whitespace-pre-line">
            {renderTemplate(body, sample)}
          </p>
        </div>
        <TextField
          label={m.messages_provider_template()}
          hint={m.messages_provider_template_hint()}
          value={providerTemplate}
          maxLength={64}
          disabled={!editable}
          onChange={(event) => setProviderTemplate(event.target.value.toLowerCase())}
        />
        {editable && (
          <div className="flex justify-end">
            <Button
              disabled={busy || !changed || !body.trim()}
              onClick={() => onSave({ kind: template.kind, enabled, body, providerTemplate })}
            >
              {m.action_save()}
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
