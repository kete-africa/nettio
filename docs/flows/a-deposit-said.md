# A deposit said in a sentence, or dictated

```mermaid
sequenceDiagram
  participant R as Reception
  participant S as Screen « Nouveau dépôt »
  participant N as Nettio (server)
  participant H as Transcription model
  participant M as Language model
  R->>S: types a sentence, or « Dicter » then « Arrêter »
  S->>N: understand — the sentence, or the recording (read once, never kept)
  N->>N: signed in · may receive a deposit (orders:create) · budget of the organization
  opt a recording
    N->>H: the audio
    H-->>N: the words that were said
  end
  N->>M: the rules · the catalogue's names and identifiers (no price) · the words
  M-->>N: lines (service, article, quantity), phone, name, pack, express, what it could not place
  N->>N: settle (pure) — keeps only the couples that have a price, in quantities that can be
  N-->>S: what was heard · what was understood · what is not in the deposit
  S-->>R: the form is filled — she reads, corrects
  R->>S: « Enregistrer le dépôt »
  S->>N: orders_receive — the same command, rules and rights as a deposit entered by hand
```

The sentence writes nothing. What the model returns is a proposal for the form: `settle`
(`src/features/orders/domain/understand.ts`) drops every identifier it does not know, every piece
with no price for its service, every quantity that cannot be, and names what it dropped. A
sentence cannot touch a price, a discount or a payment: what is understood has no field for them.

Each call is metered to the organization — `deposit_voice` for the hearing, `deposit_entry` for
the understanding — as the agent `agt_nettio_listen` acting for the person.

Without `NETTIO_AI_*` the section is not shown; without `NETTIO_AI_TRANSCRIPTION_MODEL` only
« Dicter » is missing. Nothing is simulated.
