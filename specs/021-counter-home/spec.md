# Feature Specification: The counter in two gestures

**Feature Branch**: `021-counter-home`

**Created**: 2026-10-09

**Status**: Implemented — a change of screens, not of rules

**Input**: the author's validation of 2026-10-09: « une recherche unique, puis la fiche du dépôt
avec "Remettre et encaisser" en un seul geste ».

## User Scenarios & Testing

### User Story 1 — One search (Priority: P1)

On the day's first screen, one field: a phone, a deposit's number or a name. The deposits that
match appear under it, the ready ones first, each with its state and what it still owes.

### User Story 2 — What waits to be handed over (Priority: P1)

Under the day's figures, « À remettre »: the ready deposits, one touch from their page.

### User Story 3 — Handed over and cashed in one gesture (Priority: P1)

On a ready deposit that still owes something, the main button says « Remettre et encaisser
2 000 F CFA »: one gesture hands it over and cashes its balance (the rule already existed —
`orders_collect` with its payment; the button now says it).

**Acceptance Scenarios** (tested in a browser):

1. A text that matches nothing says so, with the text.
2. A number and the first digits of a phone both find the deposit.
3. The ready deposit is listed under « À remettre »; once handed over, the list says nothing waits.
4. The button carries the balance; the drawer opens with that amount.

## Requirements

- **FR-001**: The search reads `orders_list` with the person's rights; nothing new on the server.
- **FR-002**: It waits for the typing to pause before asking (a counter's connection is slow).
- **FR-003**: Who may not read deposits sees no search; who may not cash sees no « À remettre ».

## Proof

- `e2e/home.spec.ts` — a deposit received, made ready in the workshop, found by its name, number
  and phone, handed over and cashed.

## Known limits

- One home for everyone, its sections following the person's rights: a home drawn for each role
  (workshop, cashier, owner) is not built.
- The search finds deposits, not customers without a deposit.
