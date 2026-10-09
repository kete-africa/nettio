# Feature Specification: The assistant, one touch from every screen

**Feature Branch**: `020-assistant`

**Created**: 2026-10-09

**Status**: Implemented — see « Known limits »

**Input**: the author's remark of 2026-10-09 (« l'assistant doit être revu carrément ») and the
choice validated the same day: the assistant may prepare a gesture, never do it.
`specs/007-intelligence` (« Demander », its rules); `docs/flows/asking-nettio.md`.

## User Scenarios & Testing

### User Story 1 — A conversation, from anywhere (Priority: P1)

A button « Assistant » stands in the frame of every screen. It opens a panel — beside the page on
a wide screen, over it on a phone — where the person asks, and asks again: the conversation is
kept while she moves in the app, and each question goes with what was said before.

### User Story 2 — The answer as it is written (Priority: P1)

The words appear as they come. Under the answer, « D'où ça vient » names the readings it rests
on, each one a link to the screen where she reads the same figure herself.

### User Story 3 — Suggestions that fit (Priority: P2)

Before the first question, up to four questions are proposed: only about what her rights let her
read, and first what goes with the screen she is on.

### User Story 4 — A gesture prepared, never done (Priority: P1)

« Note 3 500 de lessive payée par la banque » : the assistant prepares the expense — a draft — and
says so. A card « Un geste est préparé » leads to the verification screen, where the person
corrects, confirms or refuses. Nothing changes before she confirms.

### User Story 5 — By voice (Priority: P2)

A microphone records the question; it is heard once, never kept, and sent as words.

**Acceptance Scenarios**:

1. **Given** a question, **Then** the stream gives its words, the readings opened, then its end.
2. **Given** an asked gesture, **Then** its capability answers « draft » and nothing is written.
3. **Given** any question, **Then** no tool that sets a price or a rate is offered to the model,
   nor any that acts at once (level 2).
4. **Given** a cashier, **Then** her tools are those of her rights: she cannot reach the result.
5. **Given** no model, **Then** the panel says it is not connected; a spent budget says so.
6. **Given** « ce mois-ci », **Then** the model knows today's date: it is given with the question.

## Requirements

- **FR-001**: The assistant is an agent acting for the person: her rights, never more. Called by
  an agent, a level 3 or 4 capability only prepares a draft (@kete/capabilities, @kete/drafts).
- **FR-002**: `catalog_set_price`, `catalog_save_pack` and `team_set_rate` are never offered:
  Nettio neither sets nor advises a price or a rate (constitution).
- **FR-003**: The answer runs within the person's rights for the whole life of its stream.
- **FR-004**: Each turn is metered to the organization; a spoken question too (`ask_voice`).
- **FR-005**: The screens use the conversation components of `@kete/design` as they exist.

## Proof

- `tests/assistant.test.ts` — 14 tests: a gesture asked for becomes a draft and nothing is
  written; what is never offered; the conversation goes with the question; the stream's events
  with a scripted model; the rights, the metering, the budget.
- `e2e/assistant.spec.ts` — the panel opens from a screen and says when no model is connected.
- With the real model, in a browser, on 2026-10-09 (`gpt-5.6-luna`): the answer streamed with its
  source as a link; a spoken-style request prepared an expense as a draft and led to its
  verification. Found there and fixed: without the date, the model answered « ce mois-ci » for a
  month of its own.

## Known limits

- Not proven with a launderer. The real-model check is one run by hand, not a regression test.
- The conversation lives in the browser tab: closing it forgets it. Nothing is kept on the server
  beyond the usage counters.
- « Demander » by WhatsApp or Telegram is not built.
- The microphone button has no browser test (no microphone there).
- The model may still prepare a gesture the person did not mean: the draft does nothing, and the
  verification screen is where it is caught.
