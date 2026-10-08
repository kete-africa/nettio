# Nettio Constitution

Nettio is a Kete App: the Kete doctrine (`kete-africa/kete`, `docs/PRINCIPES.md`,
`docs/CONCEPTION.md`, `docs/ARCHITECTURE_APP.md`, `docs/DECISIONS.md`) applies in full. This
constitution adds what is Nettio's own. Where they disagree, the doctrine wins and this file is
corrected.

## Core Principles

### I. The pain decides

Nettio exists so that the owner of a laundry knows whether he earns money, and on what
(`docs/product/decisions.md`). A feature is justified by a role's need written in
`docs/product/fonctionnalites.md`; a phase is closed by its proof (`docs/ROADMAP.md`), never by its
code. Nothing is claimed that was not observed: no testimonial, no usage figure, no « proven »
before it is.

### II. Figures are computed by code

Every amount, cost, margin, break-even and count comes from a pure function of `domain/`, tested
alone. A model hears, reads and words; it never computes, rounds or invents a figure. A figure is
always shown with its unit, its period and its assumptions; a missing measure is said (« never
measured »), never estimated silently.

### III. The owner decides; Nettio shows

Nettio never sets nor advises a price. It never writes to a laundry's customers unless the laundry
decided it. A laundry's figures never leave its organization: no average, no comparison, no resale.
An agent never cashes, cancels, refunds nor hands over alone: it prepares, a person validates
(autonomy levels of `@kete/capabilities`).

### IV. The laundry configures itself

Sites, services and their routes, steps, prices, packs, tracking grain, roles and their rights are
data the laundry sets — never code written for one customer. Changing the catalogue never changes a
past deposit: a deposit keeps the snapshot of its labels and prices. The laundry sees its
organization as a diagram drawn from these settings.

### V. One organization, one boundary

Every table carries `organization_id` and its row-level security policy in the migration that
creates it; the application role cannot bypass it. Every permission is checked on the server, for
every surface (screen, MCP, API, messaging); a person only sees the entries she may open. Each
feature has an isolation test.

### VI. Every gesture is a named command

A change is a command of `@kete/commands` (journal, idempotency, reversibility), exposed as a
capability with its permission and autonomy. Money is never deleted: an error is corrected by a
reasoned counter-entry. Sensitive gestures (discount above the ceiling, cancellation, refund,
handing over unpaid) name their author and their reason.

### VII. Always WhatsApp and Telegram

Every outgoing or incoming message goes through the channel port, with both adapters; SMS and print
are fallbacks. No vendor name in a feature's domain or application layer: ports and adapters.

### VIII. The existing design, as it is

`@kete/design`, design `kete`. No own charter, no base component of Nettio's. What Nettio adds
uses semantic tokens only. No hard-coded user-visible string: French and English catalogs, same
keys. Formats are those of the doctrine (`1 103 000 F CFA`).

### IX. Documentation and diagram with the change

A behavior change ships with its documentation and its diagram (feature `README.md`,
`docs/flows/`). Product documents are in French (`docs/product/`); everything else is in English.

## Constraints

- TypeScript strict, Node 22, pnpm; TanStack Start; Zod; Postgres on Neon; `@kete/*` packages at
  their published versions.
- What the chassis lacks is written in Nettio behind the chassis' ports, then raised to `kete-core`
  by an issue; an existing library is preferred to a rebuilt one.
- No secret in a file, a message or a commit.
- Never read the July 2026 Nettio repository as a source: Nettio is rebuilt from zero.

## Workflow

- Branches: `main` (production — the human gesture only), `dev` (integration), `NNN-slug` (one Spec
  Kit feature, branched from `dev`).
- Each feature: `specs/NNN-slug/spec.md` (what and why, acceptance scenarios), `plan.md` (how),
  `tasks.md` (the steps), then code, tests and documentation in the same pull request to `dev`.
- A pull request merges with the checks of `.github/workflows/ci.yml` green.
- Never push to `main`, never bypass a branch protection.

## Governance

This constitution supersedes habits. An amendment is a pull request that changes this file, states
why, and updates what depends on it.

**Version**: 1.0.0 | **Ratified**: 2026-10-08 | **Last Amended**: 2026-10-08
