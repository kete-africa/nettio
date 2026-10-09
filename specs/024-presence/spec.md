# Feature Specification: Clocking in and out

**Feature Branch**: `024-presence`

**Created**: 2026-10-09

**Status**: Implemented — a slice of phase 6; see « Known limits »

**Input**: phase 6 of `docs/ROADMAP.md` (« planning et pointage »); its proof: « un point tourne
une semaine sans le patron ».

## User Scenarios & Testing

### User Story 1 — « Je commence », « J'ai fini » (Priority: P1)

At the top of her day, each person has one line and one button: she says she starts, she says she
is done. The line tells her since when she is at work and her time today.

### User Story 2 — Who is at work (Priority: P1)

On « Travail et paie », the owner and the manager read « Présence »: who is at work now, each
person's time today and this month. Who did not clock in appears too, at zero.

**Acceptance Scenarios** (tested):

1. A person clocks in once: a second time is refused, with what to do. The same for clocking out.
2. An open stretch counts up to now; a stretch begun the day before counts from midnight.
3. Who does not manage reads only her own presence.
4. An agent only prepares a clocking: the person says it herself.

## Requirements

- **FR-001**: One open stretch per person, enforced by the database (a partial unique index).
- **FR-002**: The figures are computed by pure code (`presenceOf`) from what each person declared.
- **FR-003**: `clockings` has its row-level security in its creating migration (0016).
- **FR-004**: `presence:clock` for everyone of the team; `presence:read` for the owner and the
  manager.

## Proof

- `tests/team.test.ts` — the pure functions, and a real team clocking in and out, the rights, an
  agent's draft, isolation.
- `e2e/team.spec.ts` — a person clocks in from her day; the owner sees her at work.

## Known limits

- **Nettio corrects nothing**: a forgotten clocking out stays open until the person closes it;
  the owner cannot edit a stretch yet.
- No schedule: who is expected, and when, is not built — nor lateness against it.
- No location nor device check: a clocking says what the person declared.
- The fast switch of person on a shared device, validations from messaging and complaints are
  not built: phase 6 is not finished.
