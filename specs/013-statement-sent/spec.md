# Feature Specification: The evening statement, sent by itself

**Feature Branch**: `013-statement-sent`

**Created**: 2026-10-08

**Status**: Implemented — see « Known limits »

**Input**: phase 5 of `docs/ROADMAP.md` (« the owner reads his evening statement without opening
the app »); `specs/007-intelligence` (the statement itself); `docs/flows/the-evening-statement.md`.

## User Scenarios & Testing

### User Story 1 — Deciding where it goes (Priority: P1)

The owner opens « Relevé du soir », turns it on, chooses the hour and gives where it leaves to: an
e-mail address, her WhatsApp number, her Telegram. Off until she decides. The screen tells her
that whoever receives it reads the laundry's money.

**Acceptance Scenarios**:

1. **Given** nothing was decided, **Then** it is off, at 20 h, to nowhere.
2. **Given** it is turned on with nowhere to go, **Then** it is refused, with what to do.
3. **Given** a local WhatsApp number, **Then** it is kept with the laundry's country prefix.
4. **Given** a cashier, **Then** she neither reads nor sets it (`statement:send`, the owner alone
   by default).
5. **Given** an agent, **Then** it prepares the decision as a draft; a person decides.
6. **Given** a channel that is not connected on this Nettio, **Then** the screen says so.

### User Story 2 — It leaves in the evening (Priority: P1)

Every hour a job looks for the laundries whose hour has come and sends each one's statement — the
same figures and the same fixed sentences as on « Aujourd'hui » — to where it decided.

**Acceptance Scenarios**:

1. **Given** its hour is not reached, **Then** nothing leaves; from its hour on, it leaves once.
2. **Given** two workers at the same minute, **Then** one statement leaves.
3. **Given** the worker was down at its hour, **Then** it leaves later the same day — never the
   day after with another day's figures.
4. **Given** a channel refused, **Then** its reason is kept and shown; the other channels left.
5. **Given** it is turned off, **Then** nothing leaves.

### User Story 3 — Checking that it arrives (Priority: P2)

« Envoyer le relevé maintenant » sends today's statement to the saved addresses and says what it
became on each channel. It does not count as the evening's sending.

### User Story 4 — Telegram (Priority: P2)

The owner opens a link on her phone and presses « Démarrer »: her chat is tied to her laundry's
statement. The link works once; « Délier Telegram » forgets the chat.

## Requirements

- **FR-001**: The statement that leaves is `statementOf` — computed by code, worded with fixed
  sentences; no model writes any of it.
- **FR-002**: Nothing leaves unless the laundry turned it on and gave a destination.
- **FR-003**: The job reads identifiers only across organizations (`statements_due`); each
  statement is computed and sent inside its organization, under row-level security.
- **FR-004**: `statement_delivery` has its row-level security in its creating migration.
- **FR-005**: A channel is connected or not — never simulated; a refusal keeps its reason.
- **FR-006**: The channels are e-mail, WhatsApp and Telegram, behind the chassis' ports; no vendor
  is named in the feature.

## Proof

- `tests/statement.test.ts` — 17 tests: when it is due (pure), the rights, the rules, each
  channel with recorded fakes, the Telegram link through the webhook, once a day, isolation.
- `e2e/statement.spec.ts` — the owner turns it on in a browser at 375 px; who may not does not
  see it.

## Known limits

- **Not proven with a launderer**, and no channel was exercised live: the adapters are the ones of
  `specs/006-messaging`, tested on recorded exchanges; the e-mail is rendered and handed to the
  mail queue in tests, not delivered to a mailbox.
- **WhatsApp**: a business may write first only with a template approved by the provider. Without
  one (`WHATSAPP_STATEMENT_TEMPLATE`), the statement leaves as a plain message, which the provider
  refuses when the owner has not written to the number for 24 hours — the screen then says
  « hors fenêtre ». The template must take three values: the laundry, the day, the statement.
- **The hour is universal time** — the time of Lomé. A laundry in another time zone reads an hour
  that is not its own until a time-zone setting exists.
- **« Parti » for an e-mail means handed to the mail queue**; a bounce is not read back.
- One address, one number, one Telegram chat per laundry.
