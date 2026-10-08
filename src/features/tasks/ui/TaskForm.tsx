import { Button, TextField } from '@kete/design';
import { useState } from 'react';
import * as m from '@/paraglide/messages.js';

/** Adds a task: a title and, if it matters, a due date. */
export function TaskForm({
  onAdd,
}: {
  onAdd(task: { title: string; dueOn?: string }): Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        onAdd({ title, ...(dueOn ? { dueOn } : {}) })
          .then(() => {
            setTitle('');
            setDueOn('');
          })
          .finally(() => setBusy(false));
      }}
    >
      <TextField
        className="flex-1"
        label={m.task_title_label()}
        value={title}
        required
        maxLength={200}
        onChange={(event) => setTitle(event.target.value)}
      />
      <TextField
        label={m.task_due_label()}
        type="date"
        value={dueOn}
        onChange={(event) => setDueOn(event.target.value)}
      />
      <Button type="submit" disabled={busy || title.trim() === ''}>
        {m.task_add()}
      </Button>
    </form>
  );
}
