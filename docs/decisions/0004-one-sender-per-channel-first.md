---
status: accepted
date: 2026-10-08
---

# One sender per channel first; a sender per laundry later

## Context and Problem Statement

A laundry's customers receive their receipt and « it is ready » on WhatsApp or Telegram, and « the
customer talks to her laundry, not to Nettio ». The cleanest reading is one WhatsApp number and one
Telegram bot **per laundry**. That needs each laundry's credentials stored by Nettio (encrypted at
rest, with a key outside the database), an onboarding for each provider, and a webhook that finds
the laundry from the provider's account.

Nettio has no sender at all today, and one pilot.

## Considered Options

1. A sender per laundry from the start.
2. One sender per channel for the whole deployment, from the environment; messages signed with the
   laundry's name.
3. No sending by Nettio: the laundry copies each message into its own messaging.

## Decision Outcome

Option 2 now, written so that option 1 replaces it without touching the feature:

- the feature only knows the chassis' chat channel port (`@kete/notify`) and a `Channels` record;
  the adapters (`src/platform/whatsapp.ts`, `src/platform/telegram.ts`) and their credentials
  (`src/platform/channels.ts`) are wiring;
- a webhook finds whose customer a sender is through three functions that return identifiers only
  (`messaging_customers_by_phone`, `…_by_chat`, `…_by_token`) — the only reads that cross the
  organizations' boundary, audited in the migration and tested;
- without credentials a channel is « not connected »: its messages wait, nothing is simulated, and
  option 3 stays available on every receipt (the laundry's own WhatsApp or Telegram).

### Consequences

- Good, because the pilot can be served with one number and one bot, registered in its name.
- Bad, because two laundries sharing a sender would both answer a customer they have in common:
  acceptable for one pilot, not for the sale of Nettio alone.
- Therefore a sender per laundry (credentials per organization, encrypted) is required before
  phase 10; it is listed in `docs/ROADMAP.md`.
- WhatsApp only lets a business write first with an approved template: a kind of message carries
  the name of its approved template, and without one a first message is refused by the provider —
  the message then says why (`outside_window`).
- The adapters are tested against the documented shapes of both services (recorded exchanges), not
  against the live services: to do with the pilot's sender.
