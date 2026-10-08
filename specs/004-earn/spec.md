# Feature Specification: Knowing whether I earn — costs, margins, break-even

**Feature Branch**: `003-money-day` (with `003-money-day`)

**Created**: 2026-10-08

**Status**: Implemented

**Input**: the pain — « savoir s'il gagne réellement de l'argent… ils se basent sur les prix
forfaitaires, or ça peut être différent en fonction de ce qui est utilisé et du travail fait ».
`docs/product/model.md` (« Les coûts »).

## User Scenarios & Testing

### User Story 1 — The month's result (Priority: P1)

Cashed (payments minus refunds), expenses fixed and variable, the result, what the owner took,
what is left. On cash received, because the owner can check it in his till. The assumptions are
shown with the figure.

**Acceptance Scenarios**:

1. **Given** 1 103 000 cashed and 848 500 of charges of which 512 000 fixed, **Then** the result is
   254 500; with 70 000 drawn, 184 500 are left.
2. **Given** a month with nothing, **Then** every figure is zero and nothing is invented.

### User Story 2 — A cost sheet per article and service (Priority: P1)

Minutes of work, consumables, machine; measured or estimated, and when. The variable cost of a
piece = consumables + machine (+ minutes × the cost of a minute when the workshop is paid by the
piece). The fixed charges of the month are spread over the pieces of the month in proportion to
their minutes of work (equally when no minute is known). Complete cost = variable + fixed share.

**Acceptance Scenarios**:

1. **Given** a shirt at 120 of consumables, 40 of machine and 6 minutes, with labor not variable,
   **Then** its variable cost is 160.
2. **Given** 300 000 of fixed charges and a month of 1 000 shirts (6 min) and 250 suits (24 min),
   **Then** a shirt carries 150 and a suit 600.
3. **Given** a couple with no sheet, **Then** its cost is « never measured »: nothing is estimated.

### User Story 3 — What each pack really earns (Priority: P1)

The margin of a pack sold = its price − the complete cost of its real content. Over a period: its
sales, its price, the average cost of its content, its margin, and whether it rests on measures.

**Acceptance Scenarios**:

1. **Given** a 12-piece pack at 6 000 whose content costs 5 710, **Then** its margin is + 290.
2. **Given** a pack whose content has an article never measured, **Then** its margin is not
   computed on that sale, and the report says « measured in part ».
3. **Given** a pack sold at a loss, **Then** Nettio shows the figure and judges nothing.

### User Story 4 — The guard-rail at the counter (Priority: P2)

A deposit whose total falls under the variable cost of its content is flagged while it is typed
and in its history. It never blocks. Whoever may not read the money sees the flag, not the cost.

### User Story 5 — Break-even (Priority: P1)

Average contribution per unit = (cashed ÷ units) − average variable cost. Break-even = fixed
charges ÷ contribution; per day, divided by the working days. When the contribution is zero or
negative, Nettio says so in words instead of a number.

### User Story 6 — Planned against real (Priority: P2)

What the sheets planned in variable costs for the month's volume, against the month's real
variable expenses. The gap points to a wrong sheet or to waste.

## Requirements

- **FR-001**: Every figure is a pure function of `domain/`, tested alone; a model computes none.
- **FR-002**: A figure is shown with its unit, its period and how it is computed.
- **FR-003**: A missing measure is said; never estimated silently.
- **FR-004**: Nettio never advises a price.
- **FR-005**: Costs and margins are `confidential`: `money:read`.

## Success Criteria

- **SC-001**: The owner takes one decision from a figure (keeps, changes or stops a pack,
  knowingly) — to be observed with the pilot; not yet proven.
