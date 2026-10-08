# An agent with a mandate

An agent of the center (Kete Enterprise) calls the app for a person with a **mandate**: a token the
Compte Kete signs, carrying the person's same claims and an `act` claim naming the agent (kete-core
spec 049, RFC 8693). The app knows who acts — the agent — and for whom — the person.

```mermaid
sequenceDiagram
  participant P as Person
  participant E as Kete Enterprise (agent « Briefing »)
  participant K as Compte Kete
  participant A as App
  P->>E: her token (she is signed in, or her agent works for her)
  E->>K: POST /api/apps/mandates (the center's own token, kete:mandate)
  K-->>E: a mandate: sub = the person, act = agt_briefing, ten minutes at most
  E->>A: /mcp or /api/v1 with the mandate
  A->>A: caller = agent agt_briefing for the person: her rights, the agent's autonomy
  A->>A: journal: the agent, for the person
```

- **Never more than the person**: the mandate carries her claims only; her grants apply.
- **The agent's autonomy**: a decision (level 3 or 4) becomes a draft the person validates.
- **Not exchanged again**: a mandate never makes another mandate.
