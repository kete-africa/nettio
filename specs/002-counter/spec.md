# Feature Specification: The counter — a deposit, its real content, its money

**Feature Branch**: `002-counter`

**Created**: 2026-10-08

**Status**: Implemented

**Input**: phase 2 of `docs/ROADMAP.md`; `docs/product/model.md` (« Le dépôt », « Encaissements »).

## User Scenarios & Testing

### User Story 1 — A deposit in three touches (Priority: P1)

Mawuli types the customer's phone: Nettio knows her or creates her with a name. She picks a
service, taps the pieces, and saves. The deposit gets the next number of its site (`A-0412`), a
promised date, and its history starts.

**Acceptance Scenarios**:

1. **Given** a known phone, **Then** the customer is recognized; an unknown one is created with a
   name, and two customers never share a phone in the organization.
2. **Given** a deposit received at site A, **Then** its number is `A-` and the next number of that
   site, padded to four digits; two sites have their own series and no number is skipped.
3. **Given** an article with no price for the service, **Then** the deposit is refused and the
   message names the article.
4. **Given** a catalogue change after the deposit, **Then** the deposit keeps its labels and
   prices.

### User Story 2 — The real content, even under a pack (Priority: P1)

A pack never dispenses from entering the content. The pack covers the admitted pieces up to its
quota, starting with the most expensive (the customer keeps the largest advantage); the rest is
due at its normal price.

**Acceptance Scenarios**:

1. **Given** a 12-piece pack at 6 000 and 4 shirts (500) + 2 trousers (600), **Then** the total is
   6 000, six pieces are covered out of twelve, and each line keeps its real quantity.
2. **Given** the same pack and 10 shirts + 4 jackets (1 500), **Then** the 4 jackets and 8 shirts
   are covered and 2 shirts are due: total 7 000.
3. **Given** a line of a service the pack does not admit, **Then** it is due at its normal price.
4. **Given** a weight pack of 10 kg and 12.5 kg of laundry at 600 per kilo, **Then** 2.5 kg are
   due: total = pack price + 1 500.

### User Story 3 — Express and discount, within the ceiling (Priority: P2)

**Acceptance Scenarios**:

1. **Given** an express surcharge of 50 %, **Then** it applies to the total before discount.
2. **Given** a discount, **Then** it needs a reason and never makes the total negative.
3. **Given** a discount above the ceiling, **When** the person lacks `orders:discount`, **Then** it
   is refused; a person who holds it may grant it.

### User Story 4 — Every franc has a trace (Priority: P1)

A payment is a deposit or the balance, by cash, Mobile Money, card or transfer. It is never
deleted: an error is corrected by a reasoned refund.

**Acceptance Scenarios**:

1. **Given** a total of 5 400, **When** 3 000 is cashed, **Then** paid is 3 000 and the balance
   2 400; a payment above the balance is refused.
2. **Given** a refund, **Then** it needs a reason and `payments:refund`, and never exceeds what
   was paid.
3. **Given** an agent, **Then** it never cashes: it prepares a draft a person confirms.

### User Story 5 — Ready, handed over, or cancelled (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a ready deposit with a balance, **When** it is handed over without
   `orders:release_unpaid`, **Then** it is refused and the message says the amount; with the
   balance paid in the same gesture, it goes through.
2. **Given** a deposit that is not ready, **Then** it cannot be handed over.
3. **Given** a cancellation, **Then** it needs a reason and `orders:cancel`, is only possible
   before « ready », and is refused while money was paid and not refunded.
4. **Given** a collected or cancelled deposit, **Then** nothing changes it any more.
5. **Given** every gesture, **Then** it is a line of the deposit's history, dated and signed.

### User Story 6 — The receipt (Priority: P2)

A printable receipt (number, content, total, paid, balance, promised date) and the same words as a
message ready to send from the laundry's own messaging. The channel adapters arrive with
`006-messaging`.

### Edge Cases

- A person attached to some sites only cannot receive a deposit elsewhere.
- A site that does not receive (a plant) takes no deposit.
- The same gesture sent twice (a double tap, a retry) creates one deposit (idempotency key).

## Requirements

- **FR-001**: Prices, pack coverage, express, discount and totals are computed by one pure function,
  used by the server and by the screen's preview.
- **FR-002**: Each table carries its row-level security in its creating migration.
- **FR-003**: Events to the center carry facts only: no name, no phone, no price.
- **FR-004**: Money gestures are autonomy level 4; a deposit is level 3.

## Success Criteria

- **SC-001**: A usual deposit is recorded in under thirty seconds on a phone (to be observed with
  the pilot — not yet proven).
- **SC-002**: The checks of the CI workflow pass.
