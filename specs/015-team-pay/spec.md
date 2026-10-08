# Feature Specification: The team's work, and pay by the piece

**Feature Branch**: `015-team-pay`

**Created**: 2026-10-08

**Status**: Implemented — a first slice of phase 6; see « Known limits »

**Input**: phase 6 of `docs/ROADMAP.md` (« piece-rate pay, salary advances »);
`docs/product/fonctionnalites.md` (« L'équipe »); `docs/flows/work-and-pay.md`.

## User Scenarios & Testing

### User Story 1 — Who did what (Priority: P1)

The owner opens « Travail et paie »: for the month, each person of the workshop, the pieces she
passed at each step. Nothing is typed: it is counted from the steps validated in the workshop.

**Acceptance Scenarios**:

1. **Given** steps validated by two people, **Then** each one's pieces are counted at each step.
2. **Given** a unit sent back by an incident and passed again, **Then** the second pass is counted
   apart (« en reprise ») and not paid.
3. **Given** another month, **Then** its own work, and nothing else.
4. **Given** who may not read the pay, **Then** the reading is refused.

### User Story 2 — The owner's rates (Priority: P1)

For each step, what the laundry pays for one piece — or nothing: a step left empty is not paid by
the piece. Nettio proposes no rate.

**Acceptance Scenarios**:

1. **Given** no rate, **Then** the work is counted and nothing is earned.
2. **Given** a rate, **Then** each person earns her pieces times it, to the franc.
3. **Given** an agent, **Then** it prepares a rate as a draft; a person decides.

### User Story 3 — Advances and pay handed (Priority: P1)

Recording a « Salaires » expense, the person says who it was handed to. It is deducted from what
her work earns: « Gagné », « Déjà remis », « Reste » — negative when she was handed ahead.

**Acceptance Scenarios**:

1. **Given** an advance handed to a person, **Then** it is in her « Déjà remis ».
2. **Given** it is paid from the till, **Then** it leaves its trace in the till like any expense.
3. **Given** it was voided, **Then** it counts nowhere.
4. **Given** « handed to » on another category, or on a monthly expense, **Then** it is refused.

### User Story 4 — My own work (Priority: P2)

In the workshop, each person reads her own month: her pieces, what they earn, what she was handed.
Nobody else's.

## Requirements

- **FR-001**: The figures are computed by pure code (`payOf`) from the signed steps
  (`work_events`) and the expenses that name who received them.
- **FR-002**: Only a step a person signed herself counts; what an agent did is nobody's pay.
- **FR-003**: `pay:read` (owner, manager, accountant by default) reads the team; `pay:manage` (the
  owner alone) sets the rates; `workshop:operate` reads one's own.
- **FR-004**: `piece_rates` has its row-level security in its creating migration.
- **FR-005**: An advance is an expense: the till, the result and the void rules are the money's.

## Proof

- `tests/team.test.ts` — 12 tests: the pure computation; a real deposit washed, sent back, washed
  again and ironed by two people; the rates and their rights; advances from Mobile Money and from
  the till; one's own work; isolation.
- `e2e/team.spec.ts` — the owner sets and removes a rate in a browser at 375 px.

## Known limits

- **A decision to confirm with the pilot**: a piece passed again after a rework is not paid a
  second time. Some laundries may want the opposite, or to charge the rework to who caused it.
- A unit followed « par sac » counts its quantity as entered (pieces, or kilos): a per-kilo unit
  is paid by the kilo at the same rate as a piece — one rate per step.
- No pay slip, no period closing, no schedule nor clocking: phase 6 is not finished — fast person
  switch on a shared device, validations from messaging and complaints are not built.
- Not proven with a launderer.
