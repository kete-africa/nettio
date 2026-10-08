# Business events to the center

A feature announces what happened — `order.received`, `order.ready` (from specs/002) — in the same transaction as
the change (`announce`, platform/announce.ts). The worker delivers them every minute to the center
(Kete Enterprise) with the app's own token: no shared key (kete-core spec 049).

```mermaid
sequenceDiagram
  participant F as A feature's command
  participant O as kete_center_outbox
  participant W as Worker
  participant K as Compte Kete
  participant E as Kete Enterprise
  F->>O: the change and its event, one transaction
  W->>K: client_credentials, scope kete:center (kept until it expires)
  W->>O: claim a batch
  W->>E: POST /public/apps/events (Bearer: the app's token)
  E-->>W: accepted · duplicate · refused, per event
  W->>O: settle; what failed waits and is tried again
```

- **Facts and identifiers only**: a subscriber reads the rest at the app's API, under its own rights.
- **Declared**: each feature's `events.ts` lists its events with their data's schema and
  classification; the manifest gives them as `emits`.
- **The app's client** needs `kete:center`: the factory grants it; for an app registered before,
  `pnpm clients center --client <id>` at the Compte Kete.
