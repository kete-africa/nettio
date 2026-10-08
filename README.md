# nettio

A Kete App, born complete: it signs people in with the Compte Kete, keeps each organization's data
apart, journals every gesture, lets agents prepare and people decide — on its screens and in their
copilot (MCP Apps) — sends its e-mails and events from a worker, and passes CI on its first commit.

```mermaid
flowchart LR
  P[Person] -->|screens /taches| W[web]
  C[Copilot · Claude, ChatGPT, Kete] -->|/mcp + views| W
  W -->|registry: same rights, journal, autonomy| DB[(Postgres · RLS)]
  W -->|jobs| Q[(kete_jobs)]
  Q --> K[worker] -->|e-mails| M[MailKite]
  K -->|events| CK[Kete Cockpit]
  W -->|sign-in| A[Compte Kete]
```

## Run locally

```bash
# Once per machine: a GitHub token with read:packages, kept in your user configuration.
pnpm config set "//npm.pkg.github.com/:_authToken" <token>
pnpm install
cp .env.example .env   # then fill it: database, Compte Kete registration, session secret
pnpm db:migrate
pnpm dev               # http://localhost:3400
pnpm worker            # in another terminal: e-mails and events
```

## Test

```bash
pnpm test              # a Neon "test" branch, or KETE_TEST_POSTGRES=container
pnpm typecheck
```

## Deploy

The repository's secret `KETE_PACKAGES_TOKEN` (read:packages) lets CI read kete-core's packages;
the image receives it as the build secret `node_auth_token`. One image, two roles (doctrine
ARCHITECTURE_APP §9): the web process (`pnpm start`, migrations at
start-up) and the worker (`pnpm worker`). An operator registers the app at the Compte Kete
(client id and secret) and declares it in Kete Cockpit (its events key).

## Make it yours

1. Name it in `kete.json` and `messages/` (`app_name`), and fill its identity card there
   (`governance`, doctrine D-040): who answers for it, the data it handles (`personal`, `financial`,
   `payment`, `children`…), whether it calls AI models, and what an outage costs (`low` to
   `critical`). Kete's registry deduces from it the controls that apply.
2. Replace `src/features/tasks` with the first real feature, keeping its layers.
3. Choose its design in `src/platform/app.ts` — `kete`, `workspace`, or its own (`design/`).
