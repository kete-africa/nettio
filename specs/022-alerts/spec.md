# Feature Specification: What deserves a look, and « expliquer ces chiffres »

**Feature Branch**: `022-alerts`

**Created**: 2026-10-09

**Status**: Implemented — a slice of phase 5; see « Known limits »

**Input**: phase 5 of `docs/ROADMAP.md` (« Surveiller : anomalies de caisse, de remises, retards à
venir » ; « Expliquer chaque chiffre »).

## User Scenarios & Testing

### User Story 1 — The alerts of the day (Priority: P1)

On the day's first screen, « À faire » lists what deserves a look, computed by code: deposits
late, deposits promised within 24 hours and not ready, ready deposits that sleep, tills closed
today with a gap, today's discounts above the laundry's ceiling, deposits of the month sold under
their variable cost, open workshop incidents. Each one leads to the screen where it is dealt
with. A quiet day lists nothing.

### User Story 2 — The same, asked (Priority: P2)

`alerts_read` is a reading like another: the assistant and a copilot open it with the person's
rights.

### User Story 3 — « Expliquer ces chiffres » (Priority: P2)

Under the day's statement and under the month's result, a link opens the assistant on the
question that explains those figures — with their source.

**Acceptance Scenarios** (tested):

1. Only what is not fine is listed, what is already wrong first; a till that falls right is no
   alert.
2. The till's gap and the deposits under cost are told only to who reads the money.
3. An express deposit is due within 24 hours; a discount above the ceiling is counted.

## Requirements

- **FR-001**: Every alert is a fact computed by pure code (`alertsOf`) from readings; no model
  decides what is an anomaly.
- **FR-002**: An alert the person may not read is left out, not hidden on the screen.

## Proof

- `tests/assistant.test.ts` — the pure function, and a real day: a till closed 500 short, a
  discount above the ceiling, an express deposit; the owner reads three alerts, the counter two.

## Known limits

- The alerts are read when the screen opens; nothing is pushed to a phone, and they are not in
  the evening statement beyond what it already says.
- No alert on consumption (stock is not built) nor on an unusual cash movement.
- « Expliquer ces chiffres » asks the assistant: without a model, the panel says it is not
  connected. No explanation is written by code beside each figure.
- « Demander » by WhatsApp or Telegram is still not built.
