# Team

The work of each person in the workshop, and what it earns at the laundry's piece rates
(specs/015-team-pay, `docs/flows/work-and-pay.md`). A first slice of phase 6.

## What it does

- `team_work` — for a month: each person's pieces at each step (a piece passed again after a
  rework is counted apart), what they earn at the rates, what she was handed, what is left.
- `my_work` — the same, for the person herself only.
- `team_set_rate` — the owner's rate for one piece at a step, or none. Nettio proposes no rate.
- `team_names` — the team's names, to say who a wage was handed to.

- `presence_clock_in`, `presence_clock_out`, `my_presence`, `team_presence` — each person clocks
  in and out herself (specs/024-presence); the owner reads who is at work and the hours.

## Rules

- The work is read from the steps signed in the workshop (`work_events`); only a step a person
  signed herself counts.
- The money handed is read from the expenses that name who received them (`expenses.paid_to`):
  wages only, on their day. The till, the result and the void rules stay the money feature's.
- `domain/pay.ts` computes, pure; `infrastructure/team.tables.ts` reads and holds the rates.

## What leaves the organization

Nothing.
