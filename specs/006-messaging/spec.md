# Feature Specification: The customer's messaging — WhatsApp and Telegram

**Feature Branch**: `006-messaging`

**Created**: 2026-10-08

**Status**: Implemented (adapters proven against recorded exchanges, not against the live services)

**Input**: « Il faut toujours penser WhatsApp et Telegram. » — phase 4 of `docs/ROADMAP.md`;
`docs/product/model.md` (« Les messages »), `docs/product/voix.md`.

## User Scenarios & Testing

### User Story 1 — Nothing leaves unless the laundry decided it (Priority: P1)

Three kinds of messages — the receipt, « it is ready », a reminder — each off until the laundry
turns it on, each with words the laundry writes. They leave in the laundry's name, never Nettio's.

**Acceptance Scenarios**:

1. **Given** a kind that is off, **When** a deposit is received, **Then** no message exists.
2. **Given** the receipt turned on, **Then** a received deposit queues one message with the
   laundry's words and the deposit's figures, computed by code.
3. **Given** a template with a placeholder Nettio does not know, **Then** it is refused, naming it.
4. **Given** a deposit that becomes ready — by hand or by its last workshop step — **Then** « it is
   ready » is queued once.

### User Story 2 — The customer chooses, and may stop (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a customer who did not consent, or whose channel is « none », **Then** the message is
   recorded as not sent, with the reason; nothing leaves.
2. **Given** a customer on Telegram who never opened the laundry's bot, **Then** the message says
   so: a bot cannot write first.
3. **Given** a customer who answers « stop », **Then** her consent is withdrawn and nothing leaves
   for her any more.
4. **Given** a customer who opens the Telegram link of her receipt, **Then** her chat is linked and
   Telegram becomes her channel.

### User Story 3 — Always WhatsApp and Telegram, behind one port (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a queued message, **Then** it leaves through the adapter of the customer's channel
   and is marked sent; a failure keeps its reason and can be sent again.
2. **Given** a channel that is not connected (no credentials), **Then** the message waits and the
   screen says the channel is not connected — nothing is simulated.
3. **Given** a WhatsApp template name set for a kind, **Then** the message leaves as that approved
   template (business-initiated messages need one outside the 24-hour window).
4. **Given** a webhook call, **Then** its signature (WhatsApp) or secret token (Telegram) is
   checked before anything is read.

### User Story 4 — « Où en est ma commande ? » (Priority: P2)

A customer writes to the laundry's number: Nettio answers with the state of her open deposits,
computed — never invented. An unknown sender gets no answer.

### User Story 5 — Chasing what sleeps, on the laundry's decision (Priority: P2)

One gesture queues a reminder for every ready deposit that sleeps, at most once per deposit in the
reminder delay.

## Requirements

- **FR-001**: No vendor name in the feature's domain or application layer: the chassis' chat
  channel port, adapters in `src/platform/`.
- **FR-002**: Every message — sent, failed, not sent — is a row with its reason.
- **FR-003**: A cross-organization lookup (which laundry does this sender belong to) returns
  identifiers only, through one audited function.
- **FR-004**: An agent prepares a template change or a reminder round (level 3); it never writes to
  customers alone.

## Known limits

- One sender per channel for the whole of Nettio (environment variables), signed with the
  laundry's name: enough for the pilot. A sender per laundry needs credentials stored per
  organization, encrypted (`docs/decisions/0004`).
- The adapters are tested against the documented shapes of both services, not against the live
  services: no Nettio sender exists yet.
- SMS and printing a letter are not connected.

## Success Criteria

- **SC-001**: A customer learns that her laundry is ready without anyone calling her (to be
  observed with the pilot — not yet proven).
