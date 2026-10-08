# Feature Specification: The workshop — « je sais quoi faire maintenant »

**Feature Branch**: `005-workshop`

**Created**: 2026-10-08

**Status**: Implemented

**Input**: phase 4 of `docs/ROADMAP.md`; `docs/product/model.md` (« L'atelier »).

## User Scenarios & Testing

### User Story 1 — A queue per step, the soonest promised first (Priority: P1)

When a deposit is received, Nettio opens its work units at the site that processes it (the counter
itself, or the plant it sends to): one per service at the « bag » grain, one per piece at the
« piece » grain. Each unit follows the route of its service, as it was when the deposit was
received. Yao opens « Atelier », picks his step, and sees what waits there.

**Acceptance Scenarios**:

1. **Given** the bag grain and a deposit of two workshop services, **Then** two units are opened,
   each with the route of its service.
2. **Given** the piece grain and 3 shirts, **Then** three units are opened; a line by the kilo is
   one unit.
3. **Given** a counter attached to a plant, **Then** the units wait at the plant.
4. **Given** a service with no step, **Then** it opens no unit.
5. **Given** a route changed after the deposit, **Then** its units keep the route they had.

### User Story 2 — One touch per step (Priority: P1)

A step is validated by one touch: signed and dated. The deposit becomes « in progress » at its
first step, and « ready » when every unit finished its route — never before.

**Acceptance Scenarios**:

1. **Given** a unit at « Tri », **When** it is validated, **Then** it waits at the next step of its
   route and the deposit is « in progress ».
2. **Given** the last step of the last unit, **Then** the deposit is « ready » and the center hears
   `order.ready`.
3. **Given** a deposit with unfinished units, **Then** it cannot be marked ready by hand.
4. **Given** a deposit with no unit, **Then** one gesture marks it ready, as before.
5. **Given** a cancelled deposit, **Then** its units leave the queue.

### User Story 3 — An incident, and a rework (Priority: P2)

A stain that stays, a damage, a missing piece, an object found in a pocket: noted on the unit, with
its author. It may send the unit back to an earlier step — a rework, counted apart; a deposit
already ready goes back to « in progress ».

**Acceptance Scenarios**:

1. **Given** a unit at « Contrôle », **When** an incident sends it back to « Lavage », **Then** it
   waits at « Lavage » again and its rework count is 1.
2. **Given** an open incident, **Then** it is listed until someone resolves it, with what was done.

## Requirements

- **FR-001**: The rules (opening units, advancing, rework) are pure functions.
- **FR-002**: Each table carries its row-level security in its creating migration.
- **FR-003**: An agent never validates a step alone (level 3).

## Success Criteria

- **SC-001**: A deposit never becomes « ready » with a piece missing (enforced and tested).
- **SC-002**: A workshop worker finds what to do next without asking (to be observed with the
  pilot — not yet proven).
