# Setting up a laundry

```mermaid
sequenceDiagram
  participant O as Owner
  participant N as Nettio
  participant D as Postgres (her organization)
  O->>N: signs in with her Compte Kete (owner of her organization)
  N->>D: notes her presence: staff, role owner
  N-->>O: /demarrage — name, profile, alone or team, first site
  O->>N: business_set_up
  N->>D: settings · sites (a plant and a counter for a chain) ·<br/>8 steps · 12 articles · 4 services and their routes
  Note over N,D: one transaction, journaled under her name — names only, never a price
  N-->>O: /pressing/schema — her laundry, drawn from what was just written
  O->>N: prices, packs, routes, sites, settings
  N-->>O: the diagram and « Aujourd'hui » follow each change
```

A second start is refused (`already_set_up`). Anyone else of the organization who signs in before
the start is told the laundry is not set up; afterwards she appears in « Équipe et droits »,
waiting for a role, and sees nothing of the business until the owner gives her one.

## A newcomer gets her role

```mermaid
sequenceDiagram
  participant M as Member
  participant N as Nettio
  participant O as Owner
  O->>O: invites her to the organization, in Mon espace Kete
  M->>N: signs in with her Compte Kete
  N-->>M: « Vous n'avez pas encore de rôle »
  O->>N: team_set_role (counter, her sites)
  M->>N: any gesture
  N->>N: her role's permissions, as the owner ticked them
  N-->>M: only the places she may open
```
