# assistant — Kete Intelligence at every station

What Nettio says by itself, and what it answers (specs/007-intelligence;
`docs/product/decisions.md`, « L'intelligence »; `docs/product/voix.md`).

| Gesture | Capability | Permission | Autonomy |
|---|---|---|---|
| The day's statement | `day_statement` | `money:read` | 1 |
| Ask a question (« Demander ») | — a screen and its server function | `assistant:ask` | — |

## The day's statement — no model

`domain/statement.ts`: a pure function. The figures come from the day's deposits and payments, the
tills, the workshop and the month's result; the sentences are fixed words from the catalogue. A
copilot reads it through MCP and quotes it as it is.

## « Demander » — the assistant

One touch from every screen (specs/020-assistant, `docs/flows/asking-nettio.md`): a panel with a
conversation kept while the person moves in the app, an answer written as it comes, its sources
as links, and the gestures it prepared.

- **The model never computes**: every figure comes from a reading (constitution II). The system
  prompt (`ask.ts`) says it, and the model is given nothing else to compute from. It is told
  today's date with each question.
- **The person's rights, never more**: `registry.tools(caller)` only returns what she may use; a
  cashier's question cannot reach the result.
- **It prepares, it never does**: called by an agent, a level 3 or 4 capability answers with a
  draft; the person verifies and confirms it at `/verification/$draftId`. Level 2 gestures, which
  act at once, are not offered — nor what sets a price or a rate (`NEVER_OFFERED`).
- **Never the database**: the model receives the conversation and what its tools returned.
- **Streamed**: `converse` yields `text`, `reading`, `prepared`, `unavailable`, `done`;
  `/api/assistant` sends them one JSON line each, within the person's rights for the whole stream.
  `askNettio` answers in one piece, for tests, the evaluation and — later — messaging.
- **Metered**: each call's usage is recorded per organization (`kete_ai_usage`); a monthly budget,
  when the operator set one, is enforced before the call.
- **Not connected, said**: without `NETTIO_AI_PROVIDER`, `NETTIO_AI_MODEL` and `NETTIO_AI_API_KEY`,
  the panel says so. Nothing is simulated.

## Copilots

Every capability of Nettio is an MCP tool at `/mcp`, with the rights of the person who signed in:
a copilot reads, and prepares drafts that a person validates (level 3) or confirms in Nettio
(level 4). No extra code here.

## Evaluating the real model

`pnpm eval:ask` (after `pnpm demo` created the demo laundry) asks « Demander » eight questions with
the model of the environment, and checks each answer in code: it carries the figure the code
computed, says « never measured » rather than guessing, advises no price, acts on nothing, and
never reaches what the person may not open. A small smoke test — to grow with the pilot's real
questions.

## The statement sent by itself

`sending.ts` (specs/013-statement-sent, `docs/flows/the-evening-statement.md`): `statementOf`
computes the statement — for the screen, a copilot and the evening's sending alike — and
`sendStatement` sends it to where the laundry decided, on each channel it gave: e-mail, WhatsApp,
Telegram, behind ports (`SendingPorts`; the adapters live in `src/platform`). A job finds every
hour the laundries whose hour has come, by identifier only, and `sendDueStatement` takes the day
once. `domain/sending.ts` holds the rules, pure; `infrastructure/delivery.tables.ts` the one line
per laundry and its row-level security.

What leaves the organization here: the statement's sentences — the laundry's money — to the
addresses its owner gave, through the mail and messaging providers of the deployment.

## Not built

« Demander » by messaging; a conversation kept beyond the browser tab. (Voice and photo entry of a deposit live in the orders feature,
specs/011-dictate and 014-photo.) See the specs' « Known limits ».
