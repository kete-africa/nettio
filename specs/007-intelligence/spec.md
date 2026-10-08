# Feature Specification: Kete Intelligence at every station — asking, and the day's statement

**Feature Branch**: `007-intelligence`

**Created**: 2026-10-08

**Status**: Implemented in part — see « Known limits »

**Input**: phase 5 of `docs/ROADMAP.md`; `docs/product/decisions.md` (« L'intelligence »),
`docs/product/voix.md` (« Les réponses de Demander »).

## User Scenarios & Testing

### User Story 1 — The day's statement, without a model (Priority: P1)

« Le patron lit son relevé du soir sans appeler. » A few sentences: what was cashed, how many
deposits and pieces, what is ready and waits, what is late, the tills and their gaps, the month so
far and what the owner took. Every figure is computed by code; the sentences are fixed words.

**Acceptance Scenarios**:

1. **Given** a day, **Then** the statement says its figures with their unit, and nothing a model
   wrote.
2. **Given** a till closed with a gap, **Then** the statement names the gap.
3. **Given** who may not read the money, **Then** the statement is refused.
4. **Given** a copilot signed in by the owner, **Then** it reads the same statement through MCP.

### User Story 2 — « Demander » (Priority: P1)

A question in plain French. The model may only call the readings the person herself may open — it
never computes, never acts, never advises a price — and answers with what they returned. The
answer names where it comes from.

**Acceptance Scenarios**:

1. **Given** the owner asks what she earned this month, **Then** the model calls `money_result`
   and the answer carries its figures; the sources name the reading.
2. **Given** a cashier asks the same, **Then** `money_result` is not among the tools: the model
   cannot reach it.
3. **Given** any question, **Then** no tool that changes anything is offered — not even as a draft.
4. **Given** no model is configured, **Then** « Demander » says it is not connected; nothing is
   simulated.
5. **Given** an organization's monthly budget of tokens is spent, **Then** the question is refused
   and the message says so.
6. **Given** a call, **Then** its usage is recorded for the organization.

### User Story 3 — Open to copilots (Priority: P1)

Every capability of Nettio is already an MCP tool with the person's rights (specs 001 to 006): a
copilot reads, and prepares drafts a person validates. Nothing more is needed here than its proof.

## Requirements

- **FR-001**: The model receives the question and what the readings returned — never the database.
- **FR-002**: The assistant is an agent acting for the person: her rights, never more; its calls
  are level 1 only.
- **FR-003**: Usage is metered per organization; a budget, when set, is enforced.
- **FR-004**: The manifest says that Nettio calls AI models, and for what.

## Known limits

- **Voice and photo entry of a deposit are not built.** They need a transcription and an
  extraction proven in a real, noisy counter (`docs/product/decisions.md`, « Ce qui n'est pas
  encore su »); the capability `orders_receive` already takes an agent's draft.
- **The evening statement is not sent by itself**: it is read in the app, by MCP, or shared by
  hand. Sending it needs the owner's own channel and a schedule per organization.
- **No answer of a real model was evaluated.** The tests drive « Demander » with a scripted model:
  they prove the wiring, the rights and the limits — not the quality of an answer.
- No monthly budget is set by default: the operator sets one per organization.

## Success Criteria

- **SC-001**: The owner reads his evening statement without opening anything else, and asks one
  question a week (to be observed with the pilot — not yet proven).
