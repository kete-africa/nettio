# Feature Specification: Invoices and credit notes

**Feature Branch**: `019-invoices`

**Created**: 2026-10-09

**Status**: Implemented — the invoices of phase 7; see « Known limits »

**Input**: the author's request of 2026-10-09 (« implémente bien la gestion des factures »);
`docs/product/fonctionnalites.md` (« Factures et avoirs numérotés », « Facture mensuelle, relevé de
compte »); `docs/flows/an-invoice.md`. Decision validated the same day: VAT off by default.

## User Scenarios & Testing

### User Story 1 — An invoice on demand (Priority: P1)

A customer asks for an invoice: from the deposit's page, « Faire la facture ». The document
carries the laundry's mentions, the customer, the content line by line, the total, what was paid
and what is due. It prints, saves as a PDF, and goes out from the laundry's WhatsApp or Telegram.

### User Story 2 — A company's month in one invoice (Priority: P1)

From a customer's page, « Compte » lists her deposits that are on no invoice: ticked, they go on
one invoice, a line per deposit.

### User Story 3 — Never deleted: a credit note (Priority: P1)

An invoice is written once. A mistake is corrected by a credit note that cancels it, with its
reason; the invoice stays as written and says what cancelled it; its deposits can be billed again.

### User Story 4 — Cashing an invoice (Priority: P1)

« Encaisser » on an invoice shares the money among its deposits that still owe something, the
oldest first, each payment under the deposits' own rules. A payment taken on a deposit counts on
its invoice.

### User Story 5 — The laundry's mentions and its VAT (Priority: P2)

Legal name, NIF, RCCM, address, a footer, the payment delay. VAT is off by default: the invoice
says « TVA non applicable ». Turned on, the tax is shown inside the prices, which do not move.

**Acceptance Scenarios** (all tested):

1. Numbers follow each other per series and per year — `F-2026-0001`, `A-2026-0001` — and a
   refused gesture takes no number.
2. A deposit is on one invoice at most; an invoice is for one customer; a cancelled deposit is
   not billed.
3. The lines add up to the deposits' totals to the franc — with a pack, express, a discount.
4. Money cashed is never more than what is due; cash follows the till's rule.
5. An invoice is cancelled once; a credit note is neither cancelled nor cashed.
6. An invoice keeps the mentions and the tax of the day it was written.
7. Reading, issuing and cancelling are three permissions; an agent prepares an invoice or a credit
   note (level 3) and never cashes (level 4).

## Requirements

- **FR-001**: The application role may read and insert an invoice and its lines — never update
  nor delete them (grants).
- **FR-002**: A number is taken in the invoice's own transaction: no gap, even on a failure.
- **FR-003**: Prices are what the customer pays; with VAT on, the tax is the part of the total
  (`vatInside`), never added to it.
- **FR-004**: Every table has its row-level security in its creating migration (0014).
- **FR-005**: The figures are computed by pure code (`domain/invoice.ts`).

## Proof

- `tests/invoices.test.ts` — 16 tests: the pure rules; on a real laundry, an invoice on demand, a
  grouped one, the refusals, the cashing shared among deposits, the credit note, the mentions and
  the VAT, a customer's account, the rights, isolation of the five tables.
- `e2e/invoices.spec.ts` — 3 browser tests at 375 px.

## Known limits

- **Not reviewed by an accountant**: the mentions an invoice must carry in Togo (OHADA, OTR) were
  not checked against the texts. To be confirmed before a laundry relies on it for its taxes.
- A credit note cancels a whole invoice; a partial credit note is not built.
- A deposit cancelled after it was invoiced leaves its invoice as it is: the person must cancel
  the invoice with a credit note.
- « Envoyer » shares the invoice as a message from the laundry's own WhatsApp or Telegram; the
  document itself is not sent through a connected channel yet. The PDF is the browser's print.
- No recurring monthly run: the month's invoice is one gesture on the customer's page.
- Customer price grids, subscriptions, prepaid credit, quotes, delivery: the rest of phase 7.
