# Invoices

Invoices and credit notes (specs/019-invoices, `docs/flows/an-invoice.md`).

## What it does

- `invoices_issue` — an invoice for one deposit (its content line by line) or for several
  deposits of one customer (a line per deposit). Its number follows the last one.
- `invoices_credit` — a credit note that cancels an invoice, with a reason.
- `invoices_cash` — money on an invoice, shared among its deposits that still owe.
- `invoices_list`, `invoices_get`, `invoices_of_order`, `invoices_account` — reading.
- `invoices_settings`, `invoices_set_settings` — the laundry's mentions, its VAT (0: none), its
  payment delay.

## Rules

- An invoice is written once: read and insert only. A credit note cancels it; nothing is deleted.
- A deposit is on one invoice at most; a credit note frees it.
- Prices are what the customer pays: VAT, when on, is inside the total.
- What an invoice was paid is what its deposits were paid.
- `domain/invoice.ts` computes, pure; `infrastructure/invoices.tables.ts` writes and reads.

## What leaves the organization

Nothing by itself: the person prints the invoice, or sends it from the laundry's own messaging.
