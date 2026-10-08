import {
  Button,
  ConfirmDialog,
  EmptyState,
  Tag,
  TextField,
  VerificationCard,
  type VerificationField,
} from '@kete/design';
import { createFileRoute, useRouter } from '@tanstack/react-router';
import { useState } from 'react';
import { decideReview, fetchReview } from '@/features/tasks/functions';
import { AppShell } from '@/lib/shell';
import { requirePerson } from '@/lib/signed-in';
import * as m from '@/paraglide/messages.js';

// The screen of a draft an agent prepared: the link a copilot always gives, and the only place a
// level 4 decision is taken, after its confirmation (doctrine D-037).
export const Route = createFileRoute('/verification/$draftId')({
  beforeLoad: ({ location }) => requirePerson(location.href),
  loader: ({ params }) => fetchReview({ data: { draftId: params.draftId } }),
  component: ReviewPage,
});

const sources: Record<string, () => string> = {
  typed: m.review_source_typed,
  system: m.review_source_system,
  message: m.review_source_message,
  photo: m.review_source_photo,
  voice: m.review_source_voice,
  document: m.review_source_document,
  inferred: m.review_source_inferred,
  import: m.review_source_import,
};

function ReviewPage() {
  const review = Route.useLoaderData();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<'validated' | 'refused' | 'error'>();

  if (!review) {
    return (
      <AppShell>
        <EmptyState title={m.review_not_found()} />
      </AppShell>
    );
  }

  const fields: VerificationField[] = review.fields.map((field) => ({
    label: field.title,
    value: field.value,
    provenance: field.source ? (sources[field.source]?.() ?? '') : '',
    uncertain: field.uncertain,
  }));

  async function decide(
    input: { action: 'validate'; confirmed: boolean } | { action: 'refuse'; reason: string },
  ) {
    if (!review) return;
    try {
      const result = await decideReview({ data: { draftId: review.draftId, ...input } });
      setOutcome(
        result.status === 'validated'
          ? 'validated'
          : result.status === 'refused'
            ? 'refused'
            : 'error',
      );
      await router.invalidate();
    } catch {
      setOutcome('error');
    } finally {
      setConfirming(false);
      setRefusing(false);
    }
  }

  const waiting = review.status === 'prepared';
  return (
    <AppShell>
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-headline font-semibold">{m.review_title()}</h1>
        <VerificationCard
          title={review.description}
          state={{
            name:
              review.status === 'prepared'
                ? 'prepared'
                : review.status === 'validated'
                  ? 'verified'
                  : 'refused',
            label: m.review_prepared(),
          }}
          fields={fields}
          {...(waiting
            ? {
                actions: (
                  <>
                    <Button variant="secondary" onClick={() => setRefusing(true)}>
                      {m.review_refuse()}
                    </Button>
                    <Button
                      onClick={() =>
                        review.autonomy === 4
                          ? setConfirming(true)
                          : void decide({ action: 'validate', confirmed: false })
                      }
                    >
                      {m.review_validate()}
                    </Button>
                  </>
                ),
              }
            : {})}
        />
        {refusing && (
          <div className="flex flex-col gap-3">
            <TextField
              label={m.review_refusal_reason()}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setRefusing(false)}>
                {m.review_cancel()}
              </Button>
              <Button
                disabled={reason.trim() === ''}
                onClick={() => void decide({ action: 'refuse', reason: reason.trim() })}
              >
                {m.review_refuse()}
              </Button>
            </div>
          </div>
        )}
        {outcome === 'validated' && <Tag tone="validated">{m.review_validated()}</Tag>}
        {outcome === 'refused' && <Tag tone="info">{m.review_refused()}</Tag>}
        {outcome === 'error' && <Tag tone="error">{m.error_generic()}</Tag>}
        <ConfirmDialog
          open={confirming}
          title={m.review_confirm_title()}
          confirmLabel={m.review_confirm()}
          cancelLabel={m.review_cancel()}
          onConfirm={() => void decide({ action: 'validate', confirmed: true })}
          onCancel={() => setConfirming(false)}
        >
          {m.review_confirm_body()}
        </ConfirmDialog>
      </div>
    </AppShell>
  );
}
