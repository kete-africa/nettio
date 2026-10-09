import { Button, PageSection, TextField } from '@kete/design';
import { useState } from 'react';
import type { PaymentMethod } from '@/features/orders';
import { methodWords } from '@/features/orders/ui/words';
import { errorSentence } from '@/lib/errors';
import { ErrorNote, Note, SelectField, TextAreaField } from '@/lib/fields';
import * as m from '@/paraglide/messages.js';
import { approvalKinds, complaintKinds, type ApprovalKind, type ComplaintKind } from '../domain/manager';
import { askApproval, openComplaint } from '../functions';
import { approvalWords, complaintWords } from './words';

const methods: PaymentMethod[] = ['cash', 'mobile_money', 'card', 'transfer'];

/**
 * On a deposit's page (specs/025-manager): what a clerk may not do alone, she asks a manager for —
 * a discount, a cancellation, a refund — and a customer's complaint is opened here.
 */
export function OrderAsk({
  orderId,
  mayAsk,
  mayComplain,
}: {
  orderId: string;
  mayAsk: boolean;
  mayComplain: boolean;
}) {
  const [form, setForm] = useState<'approval' | 'complaint' | null>(null);
  const [kind, setKind] = useState<ApprovalKind>('discount');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('mobile_money');
  const [reason, setReason] = useState('');
  const [complaint, setComplaint] = useState<ComplaintKind>('stain');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!mayAsk && !mayComplain) return null;

  async function send(work: () => Promise<{ ok: boolean; code?: string }>, done: string) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await work();
      if (outcome.ok) {
        setForm(null);
        setReason('');
        setDescription('');
        setAmount('');
        setSaid(done);
      } else {
        setError(errorSentence(outcome.code ?? ''));
      }
    } catch {
      setError(m.error_generic());
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageSection title={m.ask_manager_title()}>
      <div className="flex flex-col gap-3" aria-live="polite">
        {said && <Note>{said}</Note>}
      </div>
      {form === null && (
        <div className="mt-2 flex flex-wrap gap-3">
          {mayAsk && (
            <Button variant="secondary" onClick={() => setForm('approval')}>
              {m.ask_manager_approval()}
            </Button>
          )}
          {mayComplain && (
            <Button variant="secondary" onClick={() => setForm('complaint')}>
              {m.ask_manager_complaint()}
            </Button>
          )}
        </div>
      )}
      {form === 'approval' && (
        <div className="flex max-w-xl flex-col gap-4">
          <SelectField
            label={m.approval_kind()}
            value={kind}
            onChange={(event) => setKind(event.target.value as ApprovalKind)}
            options={approvalKinds.map((value) => ({ value, label: approvalWords[value]() }))}
          />
          {kind !== 'cancel' && (
            <TextField
              label={m.money_amount()}
              type="number"
              inputMode="numeric"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          )}
          {kind === 'refund' && (
            <SelectField
              label={m.approval_method()}
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              options={methods.map((value) => ({ value, label: methodWords[value]() }))}
            />
          )}
          <TextField label={m.approval_reason()} value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} />
          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || reason.trim() === '' || (kind !== 'cancel' && !(Number(amount) > 0))}
              onClick={() =>
                void send(
                  () =>
                    askApproval({
                      data: {
                        kind,
                        orderId,
                        amount: kind === 'cancel' ? 0 : Math.round(Number(amount)),
                        ...(kind === 'refund' ? { method } : {}),
                        reason,
                      },
                    }),
                  m.approval_asked(),
                )
              }
            >
              {m.approval_send()}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>
              {m.action_cancel()}
            </Button>
          </div>
        </div>
      )}
      {form === 'complaint' && (
        <div className="flex max-w-xl flex-col gap-4">
          <SelectField
            label={m.complaint_kind()}
            value={complaint}
            onChange={(event) => setComplaint(event.target.value as ComplaintKind)}
            options={complaintKinds.map((value) => ({ value, label: complaintWords[value]() }))}
          />
          <TextAreaField
            label={m.complaint_description()}
            value={description}
            rows={3}
            maxLength={1000}
            onChange={setDescription}
          />
          <ErrorNote>{error}</ErrorNote>
          <div className="flex flex-wrap gap-3">
            <Button
              disabled={busy || description.trim() === ''}
              onClick={() =>
                void send(
                  () => openComplaint({ data: { orderId, kind: complaint, description } }),
                  m.complaint_opened(),
                )
              }
            >
              {m.complaint_open()}
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => setForm(null)}>
              {m.action_cancel()}
            </Button>
          </div>
        </div>
      )}
    </PageSection>
  );
}
