# Feature Specification: A deposit photographed

**Feature Branch**: `014-photo`

**Created**: 2026-10-08

**Status**: Implemented — see « Known limits »

**Input**: phase 5 of `docs/ROADMAP.md` (« voice and photo entry of a deposit »);
`specs/011-dictate` (the same path, for a sentence); `docs/flows/a-deposit-said.md`.

## User Scenarios & Testing

### User Story 1 — The customer's list, photographed (Priority: P1)

A customer comes with a written list — or the clerk lays the laundry out piece by piece. « Photo »,
one picture, and the deposit's form fills itself as it does for a sentence. The screen says what
Nettio read on the picture, so that a wrong reading is seen before anything is saved.

**Acceptance Scenarios**:

1. **Given** a picture of a written list, **Then** each line is in the form with its quantity, on
   the catalogue's pieces; what the laundry does not sell is named, not placed.
2. **Given** a pile, a bag, pieces that overlap, **Then** no count is guessed: what is seen is
   named as not in the deposit.
3. **Given** a picture with nothing of a deposit on it, **Then** the screen says so.
4. **Given** text on the picture that asks for a price, a discount or a payment, **Then** nothing
   of it happens: what is understood has no field for them.
5. **Given** no model is configured, **Then** « Photo » is not shown.
6. **Given** the organization's budget is spent, **Then** the picture is refused and says so.

## Requirements

- **FR-001**: The picture goes through the same code as a sentence: a model places what it reads
  on the catalogue, `settle` (pure) keeps only what has a price, in quantities that can be.
- **FR-002**: The picture is made smaller on the phone (1600 px at most), read once, never kept.
- **FR-003**: Text in a picture is content, never an instruction; and nothing is written — the
  person saves the deposit herself, through `orders_receive`.
- **FR-004**: Each reading is metered to the organization (`deposit_photo`).

## Proof

- `tests/dictate.test.ts` — 17 tests: the picture's path with a scripted model, what it is given
  (the picture, the rules of a picture, the catalogue, no price, no tool), an empty picture, the
  metering, the budget.
- `pnpm eval:dictate` — with the real model, three pictures drawn by the script (a tilted note on
  lined paper): a list read as written, an instruction on the list that changes nothing, a
  picture with no deposit. 13 / 13 with the ten sentences, on 2026-10-08 (`gpt-5.6-luna`).

## Known limits

- **Not proven on a real photograph**: the pictures of the evaluation are drawn, not taken at a
  counter — no real handwriting, no poor light, no blur. To measure with the pilot.
- **A name read from handwriting may be wrong** (the evaluation read « Aljori » for « Adjovi »):
  the screen shows what was read, and the person corrects.
- **A quantity that is written is taken as written**, up to 500: the person reads the form before
  saving.
- The button has no browser test (a browser test has no camera); the server path it calls is the
  one tested.
- Counting pieces from a picture of laundry is refused unless each piece is clearly apart; how
  well the model holds to that has not been measured.
