# Feature Specification: Several sites

**Feature Branch**: `028-sites`

**Created**: 2026-10-10

**Status**: Implemented — phase 8; see « Known limits »

**Input**: phase 8 of `docs/ROADMAP.md` — transfers with a slip between counters and the plant,
shared costs allocated, the result per site, partner drop-off points. Its proof: « une chaîne lit
le résultat de chacun de ses points ».

## User Scenarios & Testing

### User Story 1 — What should move, and its slip (Priority: P1)

« Réseau de points » lists, site by site, the deposits that should move: to their plant while they
are worked on, back to their counter once ready. One gesture sends those ticked with a numbered
slip (`T-0001`). The slip prints: from where to where, each deposit, its pieces and kilos, two
signatures.

### User Story 2 — Checked on arrival (Priority: P1)

The site that receives ticks what is there. What the slip announced and nobody found is said
missing — on the slip, on the page, in the deposit's history — and travels nowhere until found.

### User Story 3 — What each site earns (Priority: P1)

For a month: each site's deposits, pieces and sales, what it cashed, its own charges, its part of
the charges that name no site, its result. The lines add up to the laundry's own result; credit
paid ahead and not spent yet is said apart, because it belongs to no site.

### User Story 4 — Spreading the shared charges (Priority: P2)

The owner chooses the key: by sales, by pieces, or in equal parts. To the franc.

### User Story 5 — A partner's point (Priority: P2)

A counter run by a partner — a shop, a hotel desk — with the commission the laundry gives it. The
month's commission is computed on what the point received and said on its line; it is not
deducted: the laundry records it as an expense of that site when it pays it.

**Acceptance Scenarios** (tested):

1. A deposit leaves only from the site it is at; one on the road, or missing, does not leave again.
2. A slip is received once; a deposit that is not on it cannot be ticked.
3. A counter that processes by itself sends nothing anywhere.
4. The parts of the shared charges always add up to them, whatever the key and the remainders.
5. The sites' results plus the prepaid credit not spent are the laundry's result — also after a
   top-up, a payment by credit, a commission.
6. An agent never sends a slip nor sets a commission: a draft.

## Requirements

- **FR-001**: `transfer_counters`, `transfers`, `transfer_orders`, `partner_points`,
  `network_rules`, each with its row-level security in migration `0020_network`.
- **FR-002**: Where a deposit is, is derived from its last slip (`placeOf`) — never stored twice.
- **FR-003**: Every figure is computed by pure code (`allocate`, `siteResults`) from what the
  sites recorded; Nettio proposes no commission and no key.

## Proof

- `tests/network.test.ts` — 12 tests, with the isolation of the five tables.
- `e2e/network.spec.ts` — a plant and a counter created, a deposit sent and received with its
  slip, the result per site, a partner's point.

## Known limits

- **The workshop does not wait for the slip**: a deposit's units appear in the plant's queue when
  it is received at the counter, whether the bags arrived or not.
- A missing deposit is flagged; nothing « finds » it yet but a new deposit or the manager's note.
- A site's result is on what it cashed, like the laundry's: not on what it invoiced.
- A partner has no access of its own and no statement: its commission is a figure on a screen.
- Transfers carry whole deposits, not pieces.
