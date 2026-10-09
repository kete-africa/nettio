# Asking Nettio by message

```mermaid
sequenceDiagram
  participant P as Person of the team
  participant C as WhatsApp · Telegram
  participant N as Nettio (webhook)
  participant M as Language model
  P->>N: « Demander » — reads her own token (in the app)
  P->>C: sends the token from her phone
  C->>N: webhook — authenticated first
  N->>N: staff_by_messaging_token → an organization, a person · ties the address
  N-->>C: « C'est noté »
  P->>C: « Combien j'ai gagné ce mois-ci ? »
  C->>N: webhook
  N->>N: staff_by_messaging_address → the person · asStaff: her business role's rights
  alt she holds nothing (retired, no role)
    N-->>C: nothing
  else
    N->>M: the rules · today's date · the question · her readings only (level 1)
    M-->>N: the answer, from what the readings returned
    N-->>C: the answer
  end
  P->>C: « stop »
  N->>N: unties the address · the token changes
```

A sender who is nobody of a team is a customer: the message goes on to the customers' path
(`docs/flows/a-deposit.md`). Across organizations the webhook reads identifiers only.

By message Nettio only reads. A gesture is prepared and confirmed in the application
(`docs/flows/asking-nettio.md`).
