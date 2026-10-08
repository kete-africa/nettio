# Nettio — project context

> The single place where this app's context lives. `AGENTS.md` points here.

## What this app is

Nettio lets the owner of a laundry (« pressing ») know **whether he earns money, and on what**: all
the money, the real content of every deposit (even under a pack), and a cost sheet per article and
service. A complete tool by role — counter, till, workshop, courier, manager, owner, accountant —
sold alone, on the Kete chassis. The laundry's customers install nothing: WhatsApp and Telegram.

Rebuilt from zero in October 2026: **never read the July 2026 Nettio repository as a source.**

## Read before any action

1. `.specify/memory/constitution.md` — Nettio's rules.
2. `docs/product/` (French) — `decisions.md` (the pain, what is never done), `model.md` (the
   rules the code writes), `fonctionnalites.md` (the complete product, by role), `experience.md`,
   `voix.md`, `referentiels.md`, `strategie.md`, `exploitation.md`.
3. `docs/ROADMAP.md` — the phases, their proofs, what is built and what is proven.
4. The Kete doctrine (`kete-africa/kete`): `docs/PRINCIPES.md`, `docs/CONCEPTION.md`,
   `docs/ARCHITECTURE_APP.md`, `docs/DECISIONS.md`.
5. `docs/ARCHITECTURE.md`, `docs/decisions/`, `docs/flows/`, and each feature's `README.md`.

## Layout

```
kete.json          the manifest (contract manifest.v1) and the identity card
specs/             one Spec Kit feature per folder: spec.md, plan.md, tasks.md
src/routes.ts      every address, once: English files, French addresses
src/features/      one folder per feature: record, domain (pure rules), commands, policies,
                   infrastructure (SQL + row-level security), capabilities, functions, ui, README
src/platform/      the wiring, no business rule: sign-in, database, rights, registry, MCP, events
src/lib/           the shell, formats, form pieces, error sentences
db/migrations.ts   every table with its row-level security, in order
messages/          fr.json, en.json: no hard-coded string
tests/             the rules, the rights on every surface, the isolation per table
e2e/               the screens in a browser (Playwright), on the Neon "test" branch
```

## Rules

- Figures are computed by pure functions of `domain/`; a model never computes one.
- Nettio never sets nor advises a price; an agent never cashes, cancels, refunds nor hands over
  alone: it prepares a draft, a person validates.
- Every gesture is a named command exposed as a capability with its permission and autonomy.
- Every table carries `organization_id` and its RLS policy in the same migration; every feature has
  an isolation test.
- A broken rule is a `RuleError` with a code; `src/lib/errors.ts` words it (what, why, what to do).
- `@kete/design`, design `kete`, as it is. Always WhatsApp **and** Telegram, behind the port.
- No hard-coded user-visible string; no secret in a file, a message or a commit.
- A behavior change ships with its documentation and its diagram.

## Branches

`main` (production — the human gesture only) · `dev` (integration) · `NNN-slug` (one feature).
A pull request merges into `dev` when the CI check is green; the browser tests still run locally
(`docs/decisions/0003`, superseded).

## Commands

```bash
pnpm dev              # http://localhost:3400
pnpm db:migrate       # pending migrations, with the owner role
pnpm typecheck        # the build, then the types
pnpm test             # rules, rights, isolation (Neon "test" branch)
pnpm test:e2e         # the screens in a browser
pnpm demo             # try it signed in, with a small laundry set up (no Compte Kete needed)
```
