# The team's work, and pay by the piece

```mermaid
flowchart TD
  A[A step validated in the workshop<br/>workshop_advance — signed by the person] --> E[(work_events)]
  I[An incident sends a unit back<br/>the step is passed again] --> E
  R[The owner sets a rate per step<br/>team_set_rate — or leaves it empty] --> P[(piece_rates)]
  X[A « Salaires » expense handed to a person<br/>expenses_record with paidTo] --> M[(expenses)]
  E --> W[workDone: pieces per person and step<br/>first pass · passed again, apart]
  P --> C
  M --> H[handedTo: what each person was handed<br/>voided expenses apart]
  W --> C[payOf — pure<br/>pieces × rate = earned · earned − handed = left]
  H --> C
  C --> T[« Travail et paie » — team_work<br/>pay:read]
  C --> O[The workshop — my_work<br/>her own month only]
```

Nothing is typed twice: the work comes from the steps each person validated, the money from the
expenses that say who received them. An advance is an expense like another — it goes through the
till's rules, counts in the month's charges, and can be voided with a reason.

A piece passed again after a rework is counted apart and not paid a second time. A step with no
rate is counted and earns nothing: Nettio proposes no rate.
