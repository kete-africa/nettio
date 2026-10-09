import { Button, Drawer, TextField } from '@kete/design';
import { useState } from 'react';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note, SelectField } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';
import { fetchSwitch, setMyCode, type SwitchView } from '../functions';

/**
 * « Changer de personne » on a shared device (specs/025-manager): another person of the laundry
 * takes over with her own code, when the laundry allows it; and each one sets her own code here.
 */
export function PersonSwitch() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<SwitchView | null>(null);
  const [userId, setUserId] = useState('');
  const [code, setCode] = useState('');
  const [mine, setMine] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  const show = () => {
    setOpen(true);
    setError(null);
    setSaid(null);
    void fetchSwitch().then((read) => {
      setView(read);
      setUserId(read.people[0]?.userId ?? '');
    });
  };

  async function change(body: { userId: string; code: string } | { back: true }) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/auth/personne', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const outcome = (await response.json().catch(() => ({ ok: false, code: '' }))) as { ok: boolean; code?: string };
      // The whole app is loaded again: every screen is now hers, with her rights.
      if (outcome.ok) window.location.assign('/aujourdhui');
      else setError(errorSentence(outcome.code ?? ''));
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
      setCode('');
    }
  }

  async function saveMine() {
    setBusy(true);
    setError(null);
    setSaid(null);
    try {
      const outcome = await setMyCode({ data: { code: mine } });
      if (outcome.ok) {
        setMine('');
        setSaid(m.switch_code_saved());
        setView(await fetchSwitch());
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
      <button type="button" className="text-left text-body-sm text-link underline" onClick={show}>
        {m.switch_open()}
      </button>
      <Drawer open={open} onClose={() => setOpen(false)} title={m.switch_open()} closeLabel={m.action_close()}>
        {open && view && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-3" aria-live="polite">
              {said && <Note>{said}</Note>}
              <ErrorNote>{error}</ErrorNote>
            </div>
            {view.deviceOwner && (
              <Button disabled={busy} onClick={() => void change({ back: true })}>
                {m.switch_back({ name: view.deviceOwner })}
              </Button>
            )}
            {!view.enabled ? (
              <p className="text-fg-muted">{m.switch_off()}</p>
            ) : view.people.length === 0 ? (
              <p className="text-fg-muted">{m.switch_nobody()}</p>
            ) : (
              <div className="flex flex-col gap-4">
                <SelectField
                  label={m.switch_person()}
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                  options={view.people.map((person) => ({ value: person.userId, label: person.name }))}
                />
                <TextField
                  label={m.switch_code()}
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                />
                <div>
                  <Button disabled={busy || code.length !== 6 || !userId} onClick={() => void change({ userId, code })}>
                    {m.switch_confirm()}
                  </Button>
                </div>
              </div>
            )}
            <div className="flex flex-col gap-4 border-t border-line pt-5">
              <p className="text-body-sm text-fg-muted">
                {view.hasCode ? m.switch_my_code_set() : m.switch_my_code_none()}
              </p>
              <TextField
                label={m.switch_my_code()}
                hint={m.switch_my_code_hint()}
                type="password"
                inputMode="numeric"
                autoComplete="new-password"
                maxLength={6}
                value={mine}
                onChange={(event) => setMine(event.target.value.replace(/\D/g, ''))}
              />
              <div>
                <Button variant="secondary" disabled={busy || mine.length !== 6} onClick={() => void saveMine()}>
                  {m.switch_my_code_save()}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
