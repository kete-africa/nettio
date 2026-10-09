# Feature Specification: A site that runs without its owner

**Feature Branch**: `025-manager`

**Created**: 2026-10-09

**Status**: Implemented — the rest of phase 6; see « Known limits »

**Input**: phase 6 of `docs/ROADMAP.md` — schedules, the fast switch of person on a shared device
with a personal code, the manager's approvals (a discount beyond the ceiling, a cancellation, a
refund) from the app or from messaging, complaints, unclaimed deposits. Its proof: « un point
tourne une semaine sans le patron ».

## User Scenarios & Testing

### User Story 1 — « Demander au gérant » (Priority: P1)

A clerk who may not give a discount, cancel a deposit or refund asks for it from the deposit's
page, with her reason. Nothing changes on the deposit. The manager finds the request in her day
(« À faire ») and on « Gérant »; she grants or refuses. Granted, the gesture is done at once, in
the manager's name, under the deposit's own rules — checked again, because the deposit may have
changed since it was asked.

### User Story 2 — The same decision by WhatsApp or Telegram (Priority: P1)

Those who decide are told on the addresses they tied themselves (specs/023), on both channels:
who asks, what, on which deposit, why, and the request's number. The manager answers « OUI 12 »
or « NON 12 ». It is her decision: journaled in her name with its channel. A clerk who answers
« OUI 12 » is told she may not.

### User Story 3 — The shared device (Priority: P1)

One tablet at the counter, signed in by one person. Another person of the laundry takes over with
her own six-digit code — when the laundry turned this on — and the whole app becomes hers: her
name, her rights, her signature in the journal. She hands the device back in one touch.

### User Story 4 — Complaints (Priority: P2)

A complaint is opened on a deposit — damage, loss, stain, delay — with what the customer says. A
manager closes it with what was decided and what the laundry gives.

### User Story 5 — Deposits nobody comes back for (Priority: P2)

« Non-retirés » lists the ready deposits beyond the laundry's free days. The laundry decides its
own rules — free days, fee per day (zero: none), days between the warning and the release. A
manager charges the fee due, warns the customer once, and — after the delay — takes the deposit
out of the laundry, saying where the clothes went.

### User Story 6 — The usual week, and who is late (Priority: P2)

A manager sets each person's usual week: her days, her hours. « Gérant » and the day's « À faire »
say who is late: expected, her hour passed, not clocked in.

### User Story 7 — Each one's post (Priority: P3)

« Aujourd'hui » opens on what each role does first: the workshop's queue for who works in it, her
till for who cashes, and for a manager what waits for her decision.

**Acceptance Scenarios** (tested):

1. A request changes nothing; only who holds `approvals:decide` decides; a request is decided
   once; an agent only prepares a decision.
2. A discount asked while possible and decided after a payment is refused by the rule
   (`refund_first`), and the request stays pending.
3. By message: told once, on both channels, never to who asked; « OUI n » from a clerk's address
   is refused; from an unknown address it is not a decision at all.
4. A personal code is stored as a salted hash, never in the command journal; five wrong tries lock
   it for fifteen minutes.
5. The acting cookie is worth nothing on another device's session, in another organization, or
   once the laundry turns the switch off. Who acts holds her own business role's rights — never
   the device owner's.
6. No storage fee until the laundry decides one; the same days are never charged twice; on an
   invoice the fee is its own line and the lines add up; an invoiced deposit is not charged
   behind its invoice.
7. A deposit leaves only after its warning and the delay; what was paid stays earned, what was
   owed is given up as a discount whose reason is where the clothes went.

## Requirements

- **FR-001**: Seven tables — `shifts`, `approvals`, `complaints`, `manager_rules`, `storage_fees`,
  `abandon_notices`, `staff_codes` — each with its row-level security in migration `0017_manager`.
- **FR-002**: Nettio proposes no fee, no delay and no schedule: defaults are « no fee », thirty
  free days, ninety days before a release; the switch on a shared device is off.
- **FR-003**: Granting calls the deposit's own commands (`cancel-order`, `refund-payment`) or the
  discount rule; the right checked is `approvals:decide`.
- **FR-004**: A personal code never goes through a command (the journal keeps inputs): a server
  function checks it and stores `salt:scrypt`.
- **FR-005**: Who acts on a shared device is a signed cookie (`nettio_acting`, 12 h) valid only
  on top of the device's session; her identity carries no Compte Kete role and no token.
- **FR-006**: A storage fee is a column of the deposit (`orders.storage_amount`) and a line kind of
  an invoice (`storage`): receipt, deposit, invoice and till agree to the franc.
- **FR-007**: An agent never grants, releases, charges or plans: levels 3 and 4, a draft.

## Proof

- `tests/manager.test.ts` — 19 tests: the pure rules; the week and lateness; requests asked,
  refused, granted, re-checked; decisions by message on recorded channels; complaints; fees,
  warning, release; the code and its lock; the acting cookie; isolation of the seven tables.
- `e2e/manager.spec.ts` — in a browser: the laundry allows the shared device; a clerk chooses her
  code, takes over the owner's device, asks for a discount, hands the device back; the owner
  grants it from her day; a complaint opened and closed; a week planned.

## Known limits

- **By message, nothing was sent to a real phone**: no WhatsApp number nor Telegram bot is
  connected to Nettio yet. On WhatsApp, a free message only reaches a manager who wrote to the
  number in the last 24 hours (the provider's rule); an approved template is needed otherwise.
- The warning before a release uses the laundry's « reminder » words: there is no dedicated
  « notice » template yet, and no registered letter.
- A complaint has no photo: the files package is not wired in Nettio yet. Its compensation is
  said on the complaint; the money itself leaves by a refund or an expense, by hand.
- The schedule is one usual week per person: no exception for a given date, no leave, no swap.
  Hours are read in universal time — Lomé's; another time zone would be wrong.
- In an organization whose rights are managed at the center, a person acting with her code holds
  nothing (her own token is not on the device): the switch is for laundries on business roles.
- A storage fee is charged by a manager's gesture, not by itself every night.
