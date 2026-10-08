import { Button, Drawer, EmptyState, Row, RowList, Tag, TextField } from '@kete/design';
import { useState } from 'react';
import { failure } from '@/lib/errors';
import { CheckField, ErrorNote } from '@/lib/fields';
import type { Outcome } from '@/lib/rule-error';
import * as m from '@/paraglide/messages.js';

interface Named {
  id: string;
  name: string;
  active: boolean;
}

/**
 * A list of names the laundry keeps — its articles, or the steps of its workshop: add one, rename
 * it, retire it. Retired, it stays on past deposits and leaves the counter.
 */
export function NamesTab({
  label,
  addLabel,
  emptyTitle,
  items,
  editable,
  save,
  onChanged,
}: {
  label: string;
  addLabel: string;
  emptyTitle: string;
  items: Named[];
  editable: boolean;
  save: (item: { id?: string; name: string; active: boolean }) => Promise<Outcome<unknown>>;
  onChanged: () => Promise<void>;
}) {
  const [draft, setDraft] = useState<{ id?: string; name: string; active: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!draft) return;
    setBusy(true);
    try {
      const outcome = await save(draft);
      setError(failure(outcome));
      if (outcome.ok) {
        setDraft(null);
        await onChanged();
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  const open = (item?: Named) => {
    setError(null);
    setDraft(item ? { ...item } : { name: '', active: true });
  };
  return (
    <>
      {editable && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => open()}>{addLabel}</Button>
        </div>
      )}
      {items.length === 0 ? (
        <EmptyState title={emptyTitle} />
      ) : (
        <RowList label={label}>
          {items.map((item) => (
            <Row
              key={item.id}
              title={item.name}
              {...(editable ? { onClick: () => open(item) } : {})}
              end={item.active ? undefined : <Tag>{m.state_retired()}</Tag>}
            />
          ))}
        </RowList>
      )}
      <Drawer
        open={draft !== null}
        onClose={() => setDraft(null)}
        title={draft?.id ? m.action_change() : addLabel}
        closeLabel={m.action_close()}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDraft(null)}>
              {m.action_cancel()}
            </Button>
            <Button disabled={busy || !draft?.name.trim()} onClick={() => void submit()}>
              {m.action_save()}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col gap-4">
            <TextField
              label={m.field_name()}
              value={draft.name}
              maxLength={80}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
            <CheckField
              label={m.state_active()}
              checked={draft.active}
              onChange={(active) => setDraft({ ...draft, active })}
            />
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Drawer>
    </>
  );
}
