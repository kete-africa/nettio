# Nettio

> **« Je sais si je gagne, et sur quoi. »**

Nettio is the tool of a laundry (« pressing »): its counter, its till, its workshop, its team — and
above all the answer its owner never had: what each pack really earns, on its real content. A Kete
App, sold alone, built for West Africa first: F CFA, Mobile Money, WhatsApp and Telegram, a shared
phone.

- **The product**: [`docs/product/`](docs/product/) (French) — start with
  [`decisions.md`](docs/product/decisions.md).
- **Where it stands**: [`docs/ROADMAP.md`](docs/ROADMAP.md) — what is built, and separately what is
  proven.
- **How it is made**: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
  [`.specify/memory/constitution.md`](.specify/memory/constitution.md), [`CLAUDE.md`](CLAUDE.md).

## Run it

Node 22, pnpm, and a token that reads the `@kete-africa` packages.

```bash
pnpm install
cp .env.example .env   # then fill it (docs/product/exploitation.md)
pnpm db:migrate
pnpm dev
```

## Try it without the Compte Kete

```bash
pnpm demo                 # a browser opens, signed in as the owner of « Pressing Démo »
pnpm demo -- --as cashier # or manager, counter, workshop, courier, accountant
```

The production build on the Neon "test" branch, in its own organization (`org_demo`), with prices,
packs, cost sheets, charges, an open till and a few deposits. The session is signed with a secret
made for that run only; nothing of it works on another deployment.

## Check it

```bash
pnpm typecheck
pnpm design:generate --check
pnpm test
pnpm test:e2e
```
