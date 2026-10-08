# Feature Specification: A deposit said in a sentence, or dictated

**Feature Branch**: `011-dictate`

**Created**: 2026-10-08

**Status**: Implemented — see « Known limits »

**Input**: phase 5 of `docs/ROADMAP.md` (« voice and photo entry of a deposit »);
`docs/product/decisions.md` (« L'intelligence »); `docs/flows/a-deposit-said.md`.

## User Scenarios & Testing

### User Story 1 — The deposit in a sentence (Priority: P1)

At the counter, with a queue, the clerk types or says what the customer brings — « 4 chemises et 2
pantalons pour le 90 12 34 56, forfait Business » — and the deposit's form fills itself: the
pieces, their quantities, the phone, the pack, express. She reads it, corrects it, and saves it
with the same button as always. Nothing is saved by the sentence.

**Acceptance Scenarios**:

1. **Given** a sentence that names pieces the laundry sells, **Then** the form holds those pieces
   with the quantities that were said, on the service that was said — or the default one.
2. **Given** a piece the laundry does not sell, or a service with no price for it, **Then** it is
   not in the deposit and the screen names it: « à saisir à la main ou à ajouter au catalogue ».
3. **Given** a quantity that was not said, or that cannot be (half a shirt, a thousand), **Then**
   no line is made of it.
4. **Given** a sentence that asks for a price, a discount or a payment, **Then** nothing of it
   happens: what is understood has no field for them.
5. **Given** no model is configured, **Then** the section is not shown; nothing is simulated.
6. **Given** the organization's budget is spent, **Then** the sentence is refused and says so.

### User Story 2 — Dictated (Priority: P1)

The same, by voice: « Dicter », speak, « Arrêter ». The screen shows what Nettio heard, so that a
wrong hearing is seen before anything is saved. The recording is read once and never kept.

**Acceptance Scenarios**:

1. **Given** a recording, **Then** it is heard, and understood like a sentence.
2. **Given** a silent recording, **Then** the screen says nothing was heard.
3. **Given** no transcription model is configured, **Then** « Dicter » is not shown; the sentence
   can still be typed.

## Requirements

- **FR-001**: A model places the words on the catalogue; pure code (`settle`) keeps only the
  couples that have a price, in quantities that can be, and names what it dropped.
- **FR-002**: The model sees names and identifiers of the catalogue — never a price, never a
  customer, never the database.
- **FR-003**: Nothing is written: the deposit is saved by the person, through `orders_receive`,
  with her rights and the same rules as a deposit entered by hand (guard-rail included).
- **FR-004**: Only who may receive a deposit (`orders:create`) may use it.
- **FR-005**: Each call — hearing, understanding — is metered to the organization, as an agent
  acting for the person; a budget, when set, is enforced.
- **FR-006**: The manifest says what the models are called for.

## Proof

- `tests/dictate.test.ts` — 15 tests: what is kept and what is dropped (pure), the wiring with a
  scripted model and a scripted transcriber, the metering, the budget, the limits.
- `pnpm eval:dictate` — ten sentences with the real model on « Pressing Démo »: 10 / 10 on
  2026-10-08 (`gpt-5.6-luna`). One spoken sentence was heard by the real transcriber and
  understood (`gpt-4o-transcribe`), by hand, the same day.

## Known limits

- Not proven with a launderer: the sentences are the ones we imagine a clerk says. Accents, a
  noisy counter and Ewe or Mina mixed with French have not been measured.
- The dictation button was not exercised in a browser test (a browser test has no microphone);
  the server path it calls is the one tested.
- A quantity that is said is taken as said, up to 500: the person reads the form before saving.
- Photo entry — reading a handwritten ticket — is not built.
