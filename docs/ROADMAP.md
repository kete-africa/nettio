# Roadmap

> The complete product is `docs/product/fonctionnalites.md`. This file cuts it into phases. A phase
> is closed by its **proof**, never by its code: a status below says what is built, and separately
> what is proven.

## How to read a status

- **built** — the code is merged in `dev`, with its tests; nobody outside the workshop has used it.
- **proven** — the phase's proof was observed with a real launderer.
- **planned** — nothing is written.

## Phase 0 — The proof of the pain (no code)

With the pilot launderer: the margin of each of his packs, computed by hand on one month of his
notebook and invoices.

**Proof**: he is surprised by at least one figure. If he shrugs, the pain is not his and the
product's premise is reviewed before anything else is sold.

**Status**: not done. It needs the author and the pilot; no agent can do it.

## Phase 1 — The foundation: the launderer sets up his business

| Spec | What |
|---|---|
| `001-foundation` | Product documents, constitution, the Nettio rights (business roles the owner ticks), settings, sites, team, catalogue (articles, steps, services and their routes, prices, packs), guided start, **the diagram of the business**, the shell by role |

**Proof**: a launderer sets up his business alone in under fifteen minutes and recognizes it on
the diagram.

## Phase 2 — The deposit and the day's money

| Spec | What |
|---|---|
| `002-counter` | Customers by phone, the deposit with its real content, pricing (piece, kilo, pack, express, capped discount), numbering per site, the receipt, payments, pickup, the history of each deposit |
| `003-money-day` | Cash sessions (float, expected, counted, gap), expenses and charges, the owner's draws, « Aujourd'hui » |

**Proof**: 90 % of a week's deposits go through Nettio, and the till counted in the evening matches
the expected amount without a call to the owner.

## Phase 3 — Knowing whether I earn

| Spec | What |
|---|---|
| `004-earn` | Cost sheets (measured or estimated), the margin of a line, a deposit and a pack on its real content, the counter's guard-rail, the month's result, break-even, the reconciliation of planned and real variable costs |

**Proof**: the owner takes one decision from a figure (keeps, changes or stops a pack, knowingly).

## Phase 4 — The workshop and the customer's messaging

| Spec | What |
|---|---|
| `005-workshop` | Work units at the bag or piece grain, a queue per step sorted by promised date, one-touch progress, incidents and rework, storage location, « ready » |
| `006-messaging` | The channel port and its WhatsApp **and** Telegram adapters, the launderer's templates, the receipt and « ready » messages, reminders, « where is my order? », stop |

**Proof**: a customer learns that his laundry is ready without anyone calling him, and a deposit
never becomes « ready » with a piece missing.

## Phase 5 — Kete Intelligence at every station

| Spec | What |
|---|---|
| `007-intelligence` | « Demander » on every screen and by messaging (figures computed by code), the evening statement, every capability open to copilots (MCP and its views) |
| `011-dictate` | A deposit said in a sentence or dictated: it fills the counter's form, the person checks and saves |
| `014-photo` | A deposit photographed — the customer's written list, or the laundry laid out: the same path as a sentence |
| `013-statement-sent` | The evening statement leaves by itself, at the hour and to where the owner decided: e-mail, WhatsApp, Telegram |
| `020-assistant` | The assistant, one touch from every screen: a conversation, the answer as it is written, its sources as links, gestures it prepares and the person confirms |
| `021-counter-home` | The counter in two gestures: one search, then a deposit handed over and cashed |
| `022-alerts` | What deserves a look today, computed by code; « Expliquer ces chiffres » |
| `023-ask-by-messaging` | Asking Nettio from one's own WhatsApp or Telegram, with one's rights, readings only |

**Proof**: the owner reads his evening statement without opening the app, and asks one question a
week.

## Phase 6 — The team

Schedules, clocking, fast person switch on a shared device with a personal code, validations from
messaging, complaints, piece-rate pay, salary advances.

| Spec | What |
|---|---|
| `015-team-pay` | Each person's work counted from the steps she validated, the owner's piece rates, advances and pay handed |
| `024-presence` | Each person clocks in and out herself; the owner sees who is at work, and the hours |

**Proof**: a site runs a full week without the owner on site.

## Phase 7 — Customers, companies and delivery

Customer price grids, subscriptions, prepaid credit, quotes; company contracts, delivery notes,
monthly invoices and statements; the courier's round, proof of delivery, fees and zones.

| Spec | What |
|---|---|
| `018-basket` | The deposit as a basket: several services in one deposit, always in sight |
| `019-invoices` | Invoices and credit notes numbered without a gap, on demand or for several deposits of a customer; cashing; the customer's account; mentions and VAT |

**Proof**: one company customer is invoiced a month without re-entry.

## Phase 8 — Several sites

Transfers with a slip between counters and the plant, shared costs allocated, the result per site,
partner drop-off points.

**Proof**: a chain reads the result of each of its sites.

## Phase 9 — Stock and purchasing

Consumables, suppliers, purchase orders, receptions, inventories, consumption against the cost
sheets, shortage alerts.

**Proof**: one month without a shortage of detergent or hangers.

## Phase 10 — Selling Nettio alone

The landing page, sign-up and subscription through the Compte Kete, offline counter, hardware
(ticket printer, label printer, scale, scanner), full data export, help per role, legal pages.

**Proof**: a launderer nobody accompanied subscribes and records his first deposit the same day.

## Options, only when a customer asks

Conveyors and automated sorting, points and referral, optimized rounds, full payroll, tax
accounting, Europe (VAT, certified till, card).

## Status

| Phase | Built | Proven |
|---|---|---|
| 0 — the proof of the pain | — | no |
| 1 — the foundation | yes (`001-foundation`) | no |
| 2 — the deposit and the day's money | yes (`002-counter`, `003-money-day`) | no |
| 3 — knowing whether I earn | yes (`004-earn`) | no |
| 4 — the workshop and the customer's messaging | yes (`005-workshop`, `006-messaging`) — the channels are not connected to a live sender yet | no |
| 5 — Kete Intelligence at every station | in part (`007`, `011`, `013`, `014`, `020`, `022`): the day's statement — read, and sent by itself —, the assistant on every screen (it prepares, never does), a deposit said, dictated or photographed, the alerts of the day, every capability open to copilots. « Demander » by WhatsApp or Telegram is built on recorded exchanges (`023`): no channel is connected yet | no |
| 6 — the team | in part (`015-team-pay`, `024-presence`): work and pay by the piece, advances, clocking in and out. Not built: schedules, person switch on a shared device, validations from messaging, complaints, unclaimed deposits | no |
| 7 — customers, companies and delivery | in part (`019-invoices`): invoices and credit notes, the customer's account. Not built: price grids, subscriptions, prepaid credit, quotes, contracts, delivery | no |
| 8 to 10 | planned | no |

This table is updated by the pull request that closes each spec.
