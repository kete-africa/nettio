# A deposit, from the counter to its customer's hands

```mermaid
sequenceDiagram
  participant C as Customer
  participant R as Reception
  participant N as Nettio
  participant W as Workshop
  participant T as Till
  C->>R: leaves her laundry, says her phone
  R->>N: customers_lookup — known, or a name to create her
  R->>N: orders_receive — the real content line by line, the pack, express, discount
  N->>N: priceOrder (pure) · next number of the site · snapshot of labels and prices
  N-->>R: A-0412, total, promised date
  R-->>C: the receipt — printed, or sent from the laundry's WhatsApp or Telegram
  T->>N: payments_record — an advance (never above what is due)
  N->>W: its work units wait at the first step of their route
  W->>N: workshop_advance — one touch per step, signed
  N->>N: last step of the last unit → the deposit is ready
  W->>N: orders_store — where it is stored
  C->>T: comes back
  T->>N: orders_collect — the balance cashed in the same gesture
  N-->>T: collected; unpaid needs orders:release_unpaid
```

Every arrow to Nettio is a named command, journaled, and a line of the deposit's history. The
center hears `order.received`, `order.ready`, `order.collected`: identifiers and counts only.

An agent may prepare `orders_receive` from a voice note or a photo (a draft); it never runs a
money gesture.
