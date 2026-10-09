# Feature Specification: A customer's account — her prices, her credit, her quotes, her month

**Feature Branch**: `026-accounts`

**Created**: 2026-10-09

**Status**: Implemented — phase 7 without delivery (`027-delivery`); see « Known limits »

**Input**: phase 7 of `docs/ROADMAP.md` — customer price grids, subscriptions, prepaid credit,
quotes; company contracts, monthly invoices and statements. Its proof: « un client entreprise
facturé un mois sans ressaisie ».

## User Scenarios & Testing

### User Story 1 — A price agreed with a customer (Priority: P1)

On a customer's page, the owner agrees a price for a service and an article. It replaces the
catalogue's for her, and for her only: at the counter, once her phone is typed, the basket prices
itself at her prices and says so.

### User Story 2 — Credit paid ahead (Priority: P1)

A customer pays ahead — cash goes into the clerk's open till. Her credit may be larger than the
money (the laundry's bonus), never smaller. At the counter and on a deposit, « Crédit prépayé » is
one more way to pay, never beyond her balance. A refund by credit gives it back.

### User Story 3 — A subscription (Priority: P2)

Each month the customer pays an amount and receives a credit. A month is cashed once; the screen
says which subscriptions wait this month.

### User Story 4 — A quote (Priority: P2)

A quote is written from the catalogue at the customer's prices, numbered `D-2026-0001`, valid for
a number of days, printed like an invoice. The customer's answer is recorded once.

### User Story 5 — A company and its month (Priority: P1)

A company has its legal name, tax number and address — printed on its invoices —, its own days to
pay, and « one invoice a month ». On « Factures », one gesture issues the month's invoices: for
each such customer, one invoice of all her deposits of that month that are on none.

**Acceptance Scenarios** (tested):

1. Her price applies to her next deposit, not to another customer's; removed, the catalogue
   applies again. Only who holds `accounts:manage` sets one; an agent only prepares it, and the
   assistant is never offered the gesture.
2. A cash top-up needs an open till and counts in it; « cashed today » counts the money that
   came in, not the credit spent.
3. Credit is never spent beyond the balance (the customer row is locked), and never by a
   customer who has none.
4. A subscription's month is cashed once (a unique key), never outside its running months.
5. A quote keeps its prices when the catalogue or her prices change later; an expired or answered
   quote is not answered again.
6. The monthly run invoices nothing twice, and leaves out customers who pay at each deposit.

## Requirements

- **FR-001**: Seven tables — `customer_terms`, `customer_prices`, `subscriptions`,
  `credit_entries`, `quote_counters`, `quotes`, `quote_lines` — each with its row-level security
  in migration `0018_accounts`. `credit_entries` and `quote_lines` are never updated nor deleted.
- **FR-002**: `payments.method` admits `credit`; a credit payment writes its `spend` (or
  `returned`) entry in the payment's transaction.
- **FR-003**: Every figure of money keeps its meaning: a till's cash-in adds cash top-ups; « cashed »
  (day, month) adds top-ups and leaves credit payments out; a deposit's « paid » includes them.
- **FR-004**: Nettio proposes no price, no bonus and no subscription.
- **FR-005**: An invoice stores the company's mentions as written (`customer_mentions`): a later
  change of its terms never rewrites an invoice.

## Proof

- `tests/accounts.test.ts` — 11 tests: the pure rules; prices; top-ups, the till, spending,
  refunding; subscriptions; quotes; a company's month; isolation of the seven tables.
- `e2e/accounts.spec.ts` — in a browser at 375 px: a price agreed, a top-up, a deposit priced at
  her price and paid with her credit, a quote accepted, a month invoiced.

## Known limits

- A customer's own price covers a service and an article; there is no percentage for a whole
  customer, and no price by volume.
- A subscription gives credit, not « twenty kilos a month »: a quota by weight or pieces across
  several deposits is not built. A pack still covers one deposit.
- Credit is not paid back in money: only spent, or given back by a refund of a deposit.
- A quote does not become a deposit by itself: the counter records what is really received.
- The monthly run is a person's gesture, not a job at month's end; no e-mail carries the invoice.
- The legal mentions of an invoice are the laundry's to check with its accountant.
