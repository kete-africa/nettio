# nettio — project context

> The single place where this app's context lives. `AGENTS.md` points here.

## What this app is

A Kete App, born from `kete-core`'s template (spec 029). Replace this paragraph with what the app
does, for whom, and its first features.

## Read before any action

1. The Kete doctrine (`kete-africa/kete`): `docs/PRINCIPES.md`, `docs/CONCEPTION.md`,
   `docs/ARCHITECTURE_APP.md`, `docs/DECISIONS.md`.
2. `docs/ARCHITECTURE.md` and `docs/decisions/` — this app's architecture and decisions.
3. Each feature's `README.md` (`src/features/*/README.md`).

## Layout

```
kete.json          the manifest (contract manifest.v1): product, version, events, and the
                   identity card (owner, data, AI, criticality), kept true as the app changes
src/routes.ts      every address, once: English files, French addresses
src/features/      one folder per feature: record, domain, commands, queries, policies,
                   infrastructure, capabilities, ui, functions, README
src/platform/      the wiring, no business rule: sign-in, database, rights, registry, MCP,
                   events, jobs, e-mails
src/worker/        the worker role: e-mails, events (pg-boss)
db/migrations.ts   every table with its row-level security, in order
messages/          fr.json, en.json: no hard-coded string
tests/             every surface under the same rules
```

## Rules

- Every gesture is a named command (@kete/commands), and every capability declares its autonomy
  (@kete/capabilities): an agent that commits something prepares a draft a person decides.
- Every table carries `organization_id` and its RLS policy in the same migration.
- No vendor name in a feature's domain or application layer: ports and adapters.
- No hard-coded user-visible string; no secret in a file, a message or a commit.
- A behavior change ships with its documentation and its diagram.
