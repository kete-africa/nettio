---
status: accepted
date: 2026-10-01
---

# Start from the Kete template

## Context and Problem Statement

A new Kete App needs sign-in, organization isolation, a journal, agents and drafts, copilots,
e-mails, events and CI before its first feature.

## Decision Outcome

Chosen option: start from `kete-core`'s template (`pnpm create @kete-africa/app`), because every
building block arrives wired and tested, and improvements arrive through the `@kete/*` packages.

### Consequences

- Good, because the first commit passes CI and the first feature starts at once.
- Neutral, because the copied structure is the app's own: it diverges as the app grows.
