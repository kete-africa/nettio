# Asking Nettio — the assistant's panel

```mermaid
sequenceDiagram
  participant P as Person
  participant S as Panel « Assistant »
  participant N as Nettio (server)
  participant M as Language model
  participant R as Capability registry
  P->>S: a question — typed, a suggestion, or spoken
  S->>N: POST /api/assistant — the question, the conversation so far, the screen open
  N->>N: signed in · assistant:ask · the budget of the organization
  N->>M: the rules · today's date · the conversation · her tools (levels 1, 3 and 4 — never a price)
  loop until the answer is written
    M->>R: calls a tool, as an agent acting for her
    alt a reading (level 1)
      R-->>M: its figures, computed by code
      N-->>S: reading — named under the answer, a link to its screen
    else a gesture (level 3 or 4)
      R-->>M: status « draft » — nothing is written
      N-->>S: prepared — a card « Un geste est préparé »
    end
    M-->>N: words
    N-->>S: text, as it comes
  end
  P->>S: « Vérifier et confirmer »
  S->>N: /verification/$draftId — she corrects, confirms or refuses
```

The model never touches the database: it receives what its tools returned. The tools are the
person's — the registry applies her rights to each call — and a gesture called by an agent only
prepares a draft. What sets a price or a rate is not offered at all.

The answer is streamed as one JSON event per line: `text`, `reading`, `prepared`, `unavailable`,
`done`. The conversation is kept by the screen, and sent with each question.
