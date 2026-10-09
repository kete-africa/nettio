# Feature Specification: The deposit as a basket

**Feature Branch**: `018-basket`

**Created**: 2026-10-09

**Status**: Implemented — a change of screen, not of rules

**Input**: the author's remark of 2026-10-09: « pour un dépôt on peut avoir plusieurs services à la
fois — lavage au kilo, repassage — pour un seul dépôt ». The model, the prices and the workshop
already held several services in one deposit (`specs/002-counter`, `005-workshop`); the screen
showed one service at a time and lost the others from sight.

## User Scenarios & Testing

### User Story 1 — Several services, one deposit, always in sight (Priority: P1)

The clerk adds shirts to wash and iron, trousers to iron only, and laundry by the kilo — in the
same deposit. Each service says on its chip what it already holds. The basket lists the deposit
service by service, with its total and the buttons to save and to cash.

**Acceptance Scenarios**:

1. **Given** pieces in three services, **Then** each service's chip carries its count (pieces, or
   kilos) and the basket shows three groups, their amounts and the total.
2. **Given** a line taken out of the basket, **Then** it leaves the deposit and the total follows.
3. **Given** a phone, **Then** a bar follows the thumb with what the basket holds and its total,
   one touch from the basket; it is there from the start, empty.
4. **Given** a wide screen, **Then** the basket stands beside the articles and stays in sight.
5. **Given** the customer is missing, **Then** the basket says what is needed to save.

## Requirements

- **FR-001**: Nothing moves under the finger while pieces are added: the services are one row that
  scrolls sideways and never wraps, and the phone's basket bar never appears mid-gesture.
- **FR-002**: The rules are untouched: prices, packs, express, discount, the guard-rail and
  `orders_receive` are those of `specs/002-counter` and `004-earn`.
- **FR-003**: Dictating, photographing and writing a sentence (`specs/011`, `014`) are three
  buttons above the services; the sentence field opens on demand.

## Proof

- `e2e/basket.spec.ts` — three browser tests: one deposit with three services at 375 px, a line
  removed, the deposit saved with its total; the two panes at 1280 px.
- Found while testing, and fixed: a chip that grew with its count wrapped the row and pushed the
  articles down — the next tap landed elsewhere and a piece was lost.

## Known limits

- Not proven with a clerk at a counter.
- The design is `@kete/design` as it exists; no pictogram per article yet.
