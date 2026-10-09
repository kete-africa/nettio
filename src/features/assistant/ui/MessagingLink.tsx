import { Button, PageSection, Tag } from '@kete/design';
import { useEffect, useState } from 'react';
import { ErrorNote, Note } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';
import { fetchMessagingLink, untieMessagingLink, type MessagingView } from '../functions';

/**
 * Asking Nettio from one's own WhatsApp or Telegram (specs/023-ask-by-messaging): the person ties
 * her messaging herself, by sending a token only she is shown. By message Nettio only reads.
 */
export function MessagingLink() {
  const [view, setView] = useState<MessagingView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = () =>
    fetchMessagingLink().then((read) => {
      if (read) setView(read);
    });
  useEffect(() => {
    void load();
  }, []);

  if (!view) return null;
  const tied = view.link.telegram || view.link.whatsapp;
  const none = !view.connected.telegram && !view.connected.whatsapp;

  async function untie() {
    setBusy(true);
    setError(null);
    try {
      const outcome = await untieMessagingLink();
      if (outcome.ok) await load();
      else setError(m.error_generic());
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection title={m.ask_link_title()}>
      <p className="mb-4 max-w-3xl text-body-sm text-fg-muted">{m.ask_link_hint()}</p>
      {none ? (
        <Note>{m.ask_link_not_connected()}</Note>
      ) : (
        <div className="flex max-w-xl flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {view.connected.telegram && (
              <Tag tone={view.link.telegram ? 'validated' : 'neutral'}>
                {view.link.telegram ? m.ask_link_telegram_tied() : m.ask_link_telegram_free()}
              </Tag>
            )}
            {view.connected.whatsapp && (
              <Tag tone={view.link.whatsapp ? 'validated' : 'neutral'}>
                {view.link.whatsapp ? m.ask_link_whatsapp_tied() : m.ask_link_whatsapp_free()}
              </Tag>
            )}
          </div>
          {view.telegramLink && !view.link.telegram && (
            <a
              className="inline-flex h-(--control-height) w-fit items-center rounded-control border border-line-control bg-surface-control px-(--control-padding) font-semibold text-fg hover:bg-surface-hover"
              target="_blank"
              rel="noopener noreferrer"
              href={view.telegramLink}
            >
              {m.ask_link_telegram_open()}
            </a>
          )}
          {view.connected.whatsapp && !view.link.whatsapp && (
            <div className="rounded-box border border-line bg-surface p-4">
              <p className="text-body-sm text-fg-muted">{m.ask_link_whatsapp_how()}</p>
              <p className="mt-2 font-number break-all">{view.token}</p>
              <div className="mt-3">
                <Button
                  variant="secondary"
                  onClick={() => void navigator.clipboard.writeText(view.token).then(() => setCopied(true))}
                >
                  {copied ? m.receipt_copied() : m.ask_link_copy()}
                </Button>
              </div>
            </div>
          )}
          <ErrorNote>{error}</ErrorNote>
          {tied && (
            <div>
              <Button variant="secondary" disabled={busy} onClick={() => void untie()}>
                {m.ask_link_untie()}
              </Button>
            </div>
          )}
        </div>
      )}
    </PageSection>
  );
}
