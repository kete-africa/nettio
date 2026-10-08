---
status: accepted
date: 2026-10-08
---

# The CI's checks are run locally while the organization's CI minutes are blocked

## Context and Problem Statement

On 2026-10-08 every GitHub Actions job of the `kete-africa` organization fails in two seconds with
« The job was not started because recent account payments have failed or your spending limit needs
to be increased ». Nettio's workflow (`.github/workflows/ci.yml`) cannot run; the rule « green CI
before merging into `dev` » cannot be met by GitHub.

## Decision Outcome

Until the billing is restored, the same three steps are run locally on the feature branch before a
pull request is merged into `dev`, and their result is written in the pull request:

```bash
pnpm typecheck
pnpm design:generate --check
pnpm test
```

Nothing else changes: `main` is never pushed by an agent; a failing step blocks the merge.

### Consequences

- Bad, because a local run is not an independent machine: an environment difference can hide a
  failure.
- Therefore, when CI is back, the first action is to run the workflow on `dev` and fix what it
  finds before anything goes to `main`. This decision is then superseded.
