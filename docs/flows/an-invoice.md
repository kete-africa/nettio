# An invoice, from a deposit to its credit note

```mermaid
stateDiagram-v2
  [*] --> Due: invoices_issue — one deposit, or several of one customer
  Due --> Due: invoices_cash or payments_record — part of what is due
  Due --> Paid: everything due was cashed
  Due --> Credited: invoices_credit — a reason
  Paid --> Credited: invoices_credit — a reason
  Credited --> [*]: stays as written — its deposits can be billed again
```

```mermaid
sequenceDiagram
  participant P as Person
  participant N as Nettio
  P->>N: invoices_issue — the deposits
  N->>N: same customer · none cancelled · none already billed
  N->>N: takes the next number · linesOf (pure) · vatInside (pure)
  N->>N: writes the invoice once — customer, mentions and amounts of the day
  N-->>P: F-2026-0042
  P->>N: invoices_cash — an amount
  N->>N: allocate (pure) — oldest deposit first, never more than due
  N->>N: one payment per deposit, under the deposits' rules (the till for cash)
  P->>N: invoices_credit — a reason
  N->>N: writes A-2026-0003 with the invoice's amounts, negative · frees the deposits
```

An invoice is never changed nor deleted: the application role can only read and insert it. What
it was paid is what its deposits were paid — a payment at the counter and a payment on the invoice
are the same money. A credit note does not give money back: that is a refund, on the deposit.
