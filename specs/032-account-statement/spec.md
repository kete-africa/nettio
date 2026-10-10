# Feature Specification: A customer's statement of account

**Feature Branch**: `032-account-statement`

**Created**: 2026-10-10

**Status**: Implemented — closes phase 7's « relevé de compte »

**Input**: phase 7 of `docs/ROADMAP.md` — « monthly invoices and statements ».

## User Scenarios & Testing

### User Story 1 — « Relevé de compte à imprimer » (Priority: P2)

From a customer's page, one link opens a document: every invoice and every deposit not invoiced
yet, each with its date, its state, its total and what is still owed; then what the customer owes
in all, and the prepaid credit she holds. It prints like an invoice and goes to the company's
accountant.

**Acceptance Scenarios** (tested):

1. An invoice cancelled by a credit note claims nothing; a credit note claims nothing.
2. The total owed is the one the customer's page says (`invoices_account`): computed once.
3. Prepaid credit is shown, not deducted: it is spent at the counter.

## Requirements

- **FR-001**: The statement reads existing capabilities (`customers_get`, `invoices_account`,
  `accounts_counter`) under the person's rights: no new table, no new figure.

## Proof

- `e2e/accounts.spec.ts` — after a company's month is invoiced, its statement shows the invoice,
  what is owed and the credit it holds, at 375 px with no sideways scroll.

## Known limits

- The statement is of today: there is no statement « as of » a past date, nor for a period.
- It is not sent by itself: the laundry prints it or shares the page.
