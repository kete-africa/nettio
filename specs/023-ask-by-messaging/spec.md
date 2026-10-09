# Feature Specification: Asking Nettio from one's own WhatsApp or Telegram

**Feature Branch**: `023-ask-by-messaging`

**Created**: 2026-10-09

**Status**: Implemented on recorded exchanges — no channel is connected yet; see « Known limits »

**Input**: phase 5 of `docs/ROADMAP.md` (« "Demander" par messagerie »); the standing rule
« toujours WhatsApp et Telegram »; `docs/flows/asking-by-message.md`.

## User Scenarios & Testing

### User Story 1 — Tying one's own messaging (Priority: P1)

On « Demander », a person of the team sees her own token: a link opens her Telegram on the
laundry's bot; for WhatsApp she sends the token, as it is, to the laundry's number. The address
the token came from is tied to her — nobody types a number for someone else.

### User Story 2 — A question by message (Priority: P1)

From then on, what she writes there is a question. Nettio answers with the readings she may open
in the app — her business role decides — and with nothing that changes anything: by message a
prepared gesture could not be verified nor confirmed.

### User Story 3 — Untying (Priority: P1)

« stop » by message, or « Délier ma messagerie » in the app: the address is forgotten and her
token changes.

**Acceptance Scenarios** (tested):

1. A token nobody was shown ties nothing and is answered by silence.
2. The owner's question reaches the result; a cashier's cannot.
3. No tool that changes anything is offered to the model — nor one that sets a price.
4. A stranger's message is a customer's: the customers' path hears it, the assistant does not.
5. Who left the team, or holds no role, holds nothing by message.
6. Without a model she is told so; a spent budget too.

## Requirements

- **FR-001**: The sender is found by a function that returns identifiers only (an organization, a
  person); everything else happens inside her organization, under row-level security.
- **FR-002**: Her rights are those of her business role (`asStaff`); the owner and the admins of
  the Compte Kete organization are owners in the team.
- **FR-003**: The assistant is offered level 1 readings only (`readOnly`).
- **FR-004**: `staff_messaging` has its row-level security in its creating migration (0015).
- **FR-005**: Each answer is metered to the organization, as the assistant acting for her.

## Proof

- `tests/ask-by-messaging.test.ts` — 9 tests, through the Telegram webhook and the WhatsApp path,
  with recorded channels and a scripted model.

## Known limits

- **No channel is connected**: Nettio has no WhatsApp number nor Telegram bot of its own yet.
  Nothing here was exercised against the live services.
- Where Kete Enterprise manages the app's rights, the message path still reads the business role:
  the center's grants are not asked without a session.
- One question at a time: the conversation is not kept between two messages.
- The answer is plain text; no link to a screen, no document.
