# Feature Specification: The day's money — the till, expenses, what the owner takes

**Feature Branch**: `003-money-day` (with `004-earn`)

**Created**: 2026-10-08

**Status**: Implemented

**Input**: phase 2 of `docs/ROADMAP.md`; `docs/product/model.md` (« L'argent »).

## User Scenarios & Testing

### User Story 1 — My till falls right (Priority: P1)

Essi opens her till with its float. Every cash payment, cash refund, expense paid from the till,
owner's draw from the till and bank deposit moves what the till should hold. In the evening she
counts; Nettio says the expected amount and the gap. The gap is kept, never corrected.

**Acceptance Scenarios**:

1. **Given** a float of 10 000, 8 000 cashed, 1 000 refunded, a 2 500 expense, a 3 000 draw and a
   5 000 bank deposit, **Then** the expected amount is 6 500.
2. **Given** 6 000 counted, **Then** the gap is − 500 and stays on the closed session.
3. **Given** an open session, **Then** the same person cannot open another at the same site.
4. **Given** a laundry working as a team, **When** cash moves without an open till, **Then** it is
   refused and the message says to open the till. Alone, the till is optional.
5. **Given** Mobile Money, card or transfer, **Then** no till is needed.

### User Story 2 — Everything that goes out (Priority: P1)

One list for all that goes out: a date, a label, a category, **fixed or variable**, an amount, what
it was paid from. A recurring charge (rent, wages) counts every month until it is stopped. An error
is voided with a reason, never deleted.

**Acceptance Scenarios**:

1. **Given** a rent of 150 000 recurring from August, **Then** it counts in August, September and
   October; stopped in September, it no longer counts in October.
2. **Given** a voided expense, **Then** it stays in the list, marked, and counts nowhere.
3. **Given** a recurring charge, **Then** it cannot be paid from the till.

### User Story 3 — What the owner takes (Priority: P1)

A draw is not an expense: it is shown apart. « Vous gagnez 254 500, vous avez déjà pris 70 000. »

**Acceptance Scenarios**:

1. **Given** a draw, **Then** it never changes the result; it is deducted from what is left.
2. **Given** anyone but the owner, **Then** recording a draw is refused.

## Requirements

- **FR-001**: Expected, gap and the month's charges are pure functions.
- **FR-002**: Money is never deleted: a void or a refund, with a reason.
- **FR-003**: Each table carries its row-level security in its creating migration.
- **FR-004**: An agent prepares an expense from a photo (level 3); it never opens, closes nor
  draws (level 4).

## Success Criteria

- **SC-001**: The till counted in the evening matches the expected amount without a call to the
  owner (to be observed with the pilot — not yet proven).
