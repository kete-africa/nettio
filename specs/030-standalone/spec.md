# Feature Specification: Nettio sold alone — the front door, the legal pages, help, the data

**Feature Branch**: `030-standalone`

**Created**: 2026-10-10

**Status**: Implemented — a first slice of phase 10; see « Known limits » and `031-device`

**Input**: phase 10 of `docs/ROADMAP.md` — the landing page, sign-up and subscription through the
Compte Kete, full data export, help per role, legal pages. Its proof: « un blanchisseur que
personne n'a accompagné s'abonne et enregistre son premier dépôt le jour même ».

## User Scenarios & Testing

### User Story 1 — The front door (Priority: P1)

Someone who is not signed in reads, at `/`, what Nettio is and what it never does, then comes in
with her Compte Kete: « Commencer » leads to the sign-in and, once back, to the three questions
that set her laundry up. Someone signed in goes straight to her day.

### User Story 2 — The legal pages (Priority: P1)

« Mentions légales », « Confidentialité » and « Conditions d'utilisation » are read without
signing in, from the front door and from the help. They say what Nettio records, why, what
goes through WhatsApp, Telegram and a language model, and that the laundry's data is its own.
Who publishes is said by the deployment's environment — and where it is not said yet, the page
says so in plain words instead of inventing it.

### User Story 3 — Help by role (Priority: P2)

« Aide et données » opens on the person's own role — what to do first, in four or five steps —
and keeps the other roles folded.

### User Story 4 — The subscription (Priority: P2)

The owner reads until when her organization's access to Nettio runs, as her Compte Kete's token
says it, and the link to manage it there. A deployment that asks for a subscription
(`NETTIO_REQUIRE_SUBSCRIPTION=on`) shows a banner once it has ended; nothing is locked.

### User Story 5 — « Exporter toutes mes données » (Priority: P1)

The owner downloads one file with everything her laundry recorded, table by table.

**Acceptance Scenarios** (tested):

1. Every table a migration creates is either exported or left out for a written reason: a test
   fails when a new table is in neither list.
2. The export holds the laundry's own rows only, and no secret: no hash of a personal code, no
   link token.
3. Only the owner exports: a manager, a clerk, an agent acting for them, someone signed out are
   refused. The assistant is never offered the reading.

## Requirements

- **FR-001**: `data_export` is a capability (level 1, confidential, `data:export` — the owner's
  alone); `/api/export` serves it as a download under the person's own session.
- **FR-002**: The public pages read no session and no organization's data.
- **FR-003**: Nothing about the publisher is hard-coded: `NETTIO_PUBLISHER_NAME`, `_ADDRESS`,
  `_REGISTRATION`, `_EMAIL`, `_HOST`, and `NETTIO_LEGAL_UPDATED_ON`.

## Proof

- `tests/standalone.test.ts` — the export: whole, the laundry's only, without secrets, the
  owner's alone; the two lists that cover every table.
- `e2e/standalone.spec.ts` — the front door and the three legal pages signed out; help by role;
  the download for the owner, 403 for a colleague, 401 signed out.

## Known limits

- **The legal pages were not reviewed by a lawyer**, and name no publisher until the deployment
  does. They must be completed and reviewed before Nettio is opened to the public.
- **Signing up and subscribing happen at the Compte Kete**: Nettio links there and reads the
  result. It was not exercised end to end — this staging is not registered at the Compte Kete yet.
- The landing page shows no price and no screenshot: prices are the Compte Kete's to say.
- The export is one JSON file built in memory: fine for a laundry, not for years of a chain.
  There is no import.
- Help is a few steps per role, not a manual.
