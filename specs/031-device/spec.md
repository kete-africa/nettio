# Feature Specification: This device — a counter without network, a printer, labels, a scale, a scanner

**Feature Branch**: `031-device`

**Created**: 2026-10-10

**Status**: Implemented — the rest of phase 10; see « Known limits »

**Input**: phase 10 of `docs/ROADMAP.md` — the offline counter, and hardware: ticket printer,
label printer, scale, bar code scanner.

## User Scenarios & Testing

### User Story 1 — The network drops at the counter (Priority: P1)

A clerk saves a deposit and the network is away. The deposit is kept on the device with its key;
the screen says so, and a band stays on every screen: « 1 dépôt(s) en attente d'envoi ». When the
network returns the deposit leaves by itself — once — and receives its number. A phone that
cannot be looked up is not a wall: the name is typed, and Nettio matches the customer when the
deposit is sent. A deposit a rule refuses once it reaches Nettio waits for a person, with the
reason, and may be given up — with a confirmation.

### User Story 2 — The ticket fits the printer (Priority: P2)

« Cet appareil » says the paper in this device's printer — 58 mm, 80 mm, or A4. The receipt prints
at that width. The setting stays on the device: the tablet of another counter has its own.

### User Story 3 — Labels (Priority: P2)

From a deposit, « Étiquettes » prints one label per bag or piece the workshop follows: the number,
the customer, the piece, « 2/4 », the promised day — and the number as a bar code. The label's
size is this device's.

### User Story 4 — A scanner (Priority: P2)

A scanner is a keyboard: in the search of « Aujourd'hui », scanning a label types the number and
presses Enter — the deposit opens.

### User Story 5 — A scale (Priority: P3)

Next to the kilos, « Lire la balance » asks the person to pick the scale's port, listens for a
moment and takes the last weight it said. Where the browser cannot, the button is not there and
the page says why.

**Acceptance Scenarios** (tested):

1. A deposit is kept only when the request never reached Nettio — never when Nettio answered.
2. The same key never waits twice, and the server runs it once: a deposit sent twice exists once.
3. The bar code is Code 128 as the standard writes it: 107 distinct symbols of 11 modules, the
   stop of 13, the check symbol of its worked example. What cannot be written is not printed.
4. A scale's weight is the last one it stated, to the gram; no weight, a negative one, another
   unit or a stray run of digits is nothing — never a guess.
5. What is read back from the device and is not a list of deposits is no list at all.

## Requirements

- **FR-001**: Nothing new on the server: the deposit kept is sent through `orders_receive` with
  its idempotency key, under the same rights and rules as any deposit.
- **FR-002**: What is this device's own lives in its browser (`localStorage`): the paper, the
  label, the scale's speed, the deposits it keeps. No table, no secret.
- **FR-003**: The rules are pure and tested without a device (`code128`, `weightIn`,
  `withPending`, `isNetworkFailure`).

## Proof

- `tests/device.test.ts` — 10 tests.
- `e2e/device.spec.ts` — the paper and the label size on a device; a deposit's labels with their
  bar code; a scanned number that opens its deposit; a deposit saved offline, kept, then sent by
  itself once the network returns — and present exactly once.

## Known limits

- **No hardware was plugged in**: no thermal printer, no label printer, no scale, no scanner was
  used to prove this. The bar code is the standard's; the scale reader follows the common
  « weight + unit » lines and was tried on written examples only.
- **Offline is « the page is open and the network drops »**: Nettio is not installed on the
  device. A page reloaded without network does not open; what was kept stays on the device and
  leaves the next time Nettio is opened with network.
- Offline, only a deposit is kept — not a payment on an older deposit, not a hand-over. The
  catalogue and prices are those the page had loaded.
- A deposit kept offline has no number until it is sent: its paper ticket waits for it.
- Printing goes through the browser's print dialog: Nettio does not drive a printer directly,
  cut the paper nor open a cash drawer.
- A scale needs a browser with serial ports (Chrome or Edge, on a computer or Android).
