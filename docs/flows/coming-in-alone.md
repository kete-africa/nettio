# Coming in alone

```mermaid
flowchart TD
  V[Someone opens Nettio] --> S{Signed in?}
  S -- yes --> D[Her day — /aujourdhui]
  S -- no --> L[The front door: what Nettio is,<br/>what it never does, the legal pages]
  L --> C[« Commencer »]
  C --> K[The Compte Kete: account, organization, subscription]
  K --> B[Back in Nettio: three questions<br/>set the laundry up]
  B --> P[Her prices — Nettio proposes none]
  P --> F[Her first deposit]
  D --> H[« Aide et données »: her role first]
  H --> A[Her access: until when, managed at the Compte Kete]
  H --> E[« Exporter toutes mes données »]
  E --> X[data_export — the owner's alone<br/>every table, her rows only, no secret]
```

Every table a migration creates is in one of two lists — exported, or left out with its reason.
A test fails when a new table is in neither: a laundry's data never stays behind by oversight.
