# A customer's account

## Her price, her credit, at the counter

```mermaid
flowchart TD
  O[The owner agrees a price<br/>accounts_set_price] --> P[(customer_prices)]
  T[She pays ahead<br/>credit_top_up — cash into the clerk's till] --> E[(credit_entries<br/>top_up · cashed ≤ credit)]
  S[A subscription's month is cashed, once<br/>subscriptions_cash] --> E
  P --> C[The counter knows who she is<br/>accounts_counter: her prices, her credit]
  E --> C
  C --> B[The basket prices itself:<br/>her price where one exists, the catalogue's elsewhere]
  B --> R[orders_receive — the same rule on the server]
  R --> M{How is it paid?}
  M -- cash · Mobile Money · card · transfer --> Y[(payments)]
  M -- « Crédit prépayé » --> K[The customer is locked;<br/>balance ≥ amount, or « credit_insufficient »]
  K --> Y
  K --> E2[(credit_entries · spend)]
  Y --> F[A refund by credit gives it back<br/>credit_entries · returned]
```

The money figures keep their meaning. A till counts the cash that entered it, top-ups included.
« Cashed » — today, this month — counts money that came in: top-ups, and payments that are not
credit. A deposit paid with credit is paid; no money came in that day.

## A company and its month

```mermaid
sequenceDiagram
  participant O as Owner
  participant N as Nettio
  O->>N: accounts_set_terms — legal name, tax number, address,<br/>« one invoice a month », days to pay
  Note over N: Its deposits are received all month, unpaid
  O->>N: « Factures » → the month → « Faire les factures »<br/>invoices_month_run (level 4, confirmed)
  loop each customer invoiced monthly
    N->>N: her deposits of the month that are on no invoice
    N->>N: issue-invoice — one number, one line per deposit,<br/>her mentions as written, her own due date
  end
  N-->>O: n invoices, their total — nothing is invoiced twice
```

A quote follows the same care as an invoice: numbered by year (`D-2026-0001`), its lines written
at the prices of the day, never rewritten.
