# customers — the laundry's customers

A customer has no Nettio account: her phone is her identifier, unique in the organization, written
one way only (`domain/phone.ts`: `+` and its digits, the laundry's country prefix added to a local
number). She is created at her first deposit, from her phone and her name, and never typed twice.

| Gesture | Command | Capability | Permission | Autonomy |
|---|---|---|---|---|
| Search by name or phone | — | `customers_search` | `customers:read` | 1 |
| The customer behind a phone | — | `customers_lookup` | `customers:read` | 1 |
| One customer | — | `customers_get` | `customers:read` | 1 |
| Add or change | `save-customer` | `customers_save` | `customers:write` | 3 |

Names and phones are personal data: these capabilities are `confidential`, the journal keeps no
name nor phone of them, and no event carries them.

She chooses her channel — WhatsApp, Telegram, SMS or none — and may stop the messages (`consent`):
nothing leaves for a customer who said no (specs/006).
