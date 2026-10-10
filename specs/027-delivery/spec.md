# Feature Specification: Collecting and delivering

**Feature Branch**: `027-delivery`

**Created**: 2026-10-10

**Status**: Implemented — the rest of phase 7; see « Known limits »

**Input**: phase 7 of `docs/ROADMAP.md` — collection and delivery slips, the courier's round,
proof of delivery, fees and zones, the courier's till.

## User Scenarios & Testing

### User Story 1 — Zones and their fees (Priority: P1)

The owner lists the zones the laundry goes to and what a trip there costs the customer — zero for
a free delivery. Nettio proposes none.

### User Story 2 — « Livrer ce dépôt » (Priority: P1)

From a deposit's page: a zone, an address (the last one used for this customer is proposed), a
day. The zone's fee joins the deposit's price at once — on its page, its receipt, its invoice —
so that the courier collects the right amount.

### User Story 3 — « Ma tournée » (Priority: P1)

The courier reads her round: what is on its way first, then zone by zone; for each, the customer,
the address, what to cash. « Je pars » makes the trip hers and tells the customer her laundry is
on its way. « Remis » asks who received it and cashes what is owed — cash goes into the courier's
own till. « Pas pu » keeps the reason.

### User Story 4 — A collection (Priority: P2)

A trip to fetch laundry at a customer's: planned from « Collectes et livraisons », closed with the
name of who handed it over. Its deposit is recorded at the counter when it arrives.

### User Story 5 — The slip (Priority: P2)

Each trip has a printable slip: the laundry, the customer, the address, the deposit's content,
the fee, what to cash — and, once done, who received it, when, and what was cashed.

**Acceptance Scenarios** (tested):

1. One trip under way per deposit (a partial unique index); a deposit that is not ready does not
   leave; a trip given to someone is hers alone.
2. A delivery is not closed with a balance due, unless its customer is a company invoiced by the
   month — which, from now on, also leaves the counter unpaid.
3. Cash needs the courier's open till, and counts in it.
4. A trip nobody left for is cancelled and its fee leaves the deposit; a failed trip keeps its fee.
5. On an invoice the fee is its own line and the lines add up; no fee is added behind an invoice.
6. An agent never plans, leaves, hands over nor sets a zone's fee: a draft.

## Requirements

- **FR-001**: `delivery_zones` and `deliveries`, each with its row-level security in migration
  `0019_delivery`; `orders.delivery_amount`; the invoice line kind `delivery`.
- **FR-002**: Closing a delivery calls the deposit's own hand-over (`collect-order`): its rules,
  its history, its event to the center.
- **FR-003**: `delivery:read`, `delivery:plan`, `delivery:run`; the courier's role now holds
  `cash:operate` — her own till.
- **FR-004**: The customer is told on WhatsApp or Telegram, by her choice and consent, through the
  same outbox as any message.

## Proof

- `tests/delivery.test.ts` — 10 tests.
- `e2e/delivery.spec.ts` — a zone, a delivery planned from a deposit, the round, the hand-over
  cashed by Mobile Money, the slip.

## Known limits

- **The proof is a name and a time**: no photo, no signature drawn on the screen, no position.
  The files package is not wired in Nettio yet.
- **No channel is connected**: « en route » waits in the outbox. On WhatsApp a free sentence only
  reaches a customer who wrote in the last 24 hours.
- A round is a list, not a route: nothing orders the stops by distance.
- A collection carries no fee: there is no deposit to add it to yet. A second delivery after a
  failed one adds its fee again; cancelling it before it leaves takes it back.
- A customer has no stored address: the last one used is proposed.
- The courier's till is an ordinary till: she hands her cash over by closing it.
