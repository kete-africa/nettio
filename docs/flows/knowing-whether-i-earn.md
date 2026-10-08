# Knowing whether I earn

```mermaid
sequenceDiagram
  participant O as Owner
  participant N as Nettio
  O->>N: prices and packs (catalogue)
  Note over O,N: every deposit keeps its real content, even under a pack (specs/002)
  O->>N: expenses_record — rent (fixed, every month), detergent (variable)
  O->>N: costs_save_sheet — a shirt: 6 min, 120 of consumables, 40 of machine, measured
  O->>N: money_result (October)
  N->>N: cashed · charges fixed and variable · spreadFixed over the month's minutes
  N->>N: packMargins — price − complete cost of what each pack really covered
  N-->>O: result · what you took · break-even · each pack's margin · what is « never measured »
  O->>O: keeps, changes or stops a pack — knowingly. Nettio advises nothing.
```

At the counter, the same cost sheets feed the guard-rail: a deposit under its variable cost is
said while it is typed, and signed in its history.

A copilot may read `money_result` for the owner or his accountant; it computes nothing itself.
