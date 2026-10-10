# A delivery

```mermaid
sequenceDiagram
  participant P as Counter
  participant N as Nettio
  participant C as Courier
  participant K as Customer
  P->>N: « Livrer ce dépôt » — zone, address, day<br/>delivery_plan
  N->>N: the zone's fee joins the deposit's price<br/>orders.delivery_amount · event « delivery_fee »
  C->>N: « Ma tournée » — delivery_board
  C->>N: « Je pars » — delivery_start (the deposit must be ready)
  N-->>K: « votre linge est en route »<br/>WhatsApp or Telegram, by her choice and consent
  alt handed over
    C->>N: « Remis » — who received it, what was cashed<br/>delivery_complete (level 4)
    N->>N: collect-order under the deposit's own rules<br/>cash → the courier's own till
    N->>N: the trip keeps its proof: name, time, amount
  else nobody there
    C->>N: « Pas pu » — the reason<br/>delivery_fail
    N->>N: the deposit stays ready; its fee stays
  end
```

A company invoiced by the month receives its laundry unpaid: the fee is one more line of its
month's invoice. For everyone else the balance — fee included — is cashed before the laundry
leaves the courier's hands.

A collection is the same trip without a deposit: planned for a customer, closed with the name of
who handed the laundry over. Its deposit is recorded at the counter when it arrives.
