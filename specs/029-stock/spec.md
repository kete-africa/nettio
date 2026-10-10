# Feature Specification: Stock and purchasing

**Feature Branch**: `029-stock`

**Created**: 2026-10-10

**Status**: Implemented — phase 9; see « Known limits »

**Input**: phase 9 of `docs/ROADMAP.md` — consumables with thresholds, suppliers, purchase orders,
receptions, debts, inventories, consumption against the cost sheets, shortage alerts. Its proof:
« un mois sans rupture de lessive ni de cintres ».

## User Scenarios & Testing

### User Story 1 — The shelves (Priority: P1)

The laundry lists what it keeps — detergent, hangers, covers — each in its own unit, with the
level under which it wants to be told. Each line reads its level, its state (enough, to order,
out) and what it is worth at what was really paid.

### User Story 2 — Order, receive, owe (Priority: P1)

A purchase order to a supplier (`BC-0001`): consumables, quantities, the cost expected. Nothing
is in stock yet. The reception says what really came and what it really cost: it enters the
stock, and from then on the laundry owes it. Paying a supplier — never more than what is owed —
records an expense of the day, so that the month's result stays true.

### User Story 3 — What leaves a shelf (Priority: P1)

A withdrawal — used for the work, or lost — never more than the shelf holds. At or under its
threshold, the consumable is on the day's « À faire »: « 1 consommable(s) à commander ».

### User Story 4 — The inventory (Priority: P2)

What is counted becomes the level; the gap with what the movements said is kept as a movement of
its own. Nothing is erased.

### User Story 5 — Used against planned (Priority: P2)

For a month: what the cost sheets planned in consumables for the volume treated, against the
value of what left the shelves, and the gap. The part of the volume that has a sheet is said;
what has no known cost is named, not estimated.

**Acceptance Scenarios** (tested):

1. A level is the sum of its movements; movements are never changed nor deleted.
2. An order is received once; an order that never came is cancelled, not received at zero.
3. The average cost is what was really paid at reception — not what was expected at the order.
4. A supplier is not paid more than is owed; the payment appears in the month's expenses.
5. A withdrawal beyond the level is refused and says to take the inventory.
6. An agent never orders, receives, withdraws nor pays: a draft.

## Requirements

- **FR-001**: `stock_items`, `suppliers`, `purchase_counters`, `purchase_orders`,
  `purchase_lines`, `stock_moves`, `supplier_payments`, each with its row-level security in
  migration `0021_stock`.
- **FR-002**: Paying a supplier calls `record-expense`: the till's rules, the month's charges.
- **FR-003**: Every figure is computed by pure code (`levelOf`, `averageCost`, `stateOf`,
  `consumption`). Nettio proposes no threshold, no quantity to order and no supplier.

## Proof

- `tests/stock.test.ts` — 14 tests, with the isolation of the seven tables.
- `e2e/stock.spec.ts` — a consumable, a supplier, an order received, a withdrawal under the
  threshold said on the day, the supplier paid and the expense recorded.

## Known limits

- **A withdrawal is typed by a person**: nothing leaves the stock by itself when a deposit is
  treated. The month's « used against planned » is what shows a forgotten withdrawal.
- One stock for the laundry: not one per site.
- A reception closes its order: what did not come is ordered again.
- No purchase order is sent to the supplier by message or e-mail: it is the laundry's own note.
- The value of a shelf is at average cost of everything ever received — not first in, first out.
