# The evening statement, sent by itself

```mermaid
sequenceDiagram
  participant O as Owner
  participant S as Screen « Relevé du soir »
  participant N as Nettio (server)
  participant J as Job, every hour
  participant C as E-mail · WhatsApp · Telegram
  O->>S: turns it on, chooses the hour, gives where it goes
  S->>N: statement_set_delivery (statement:send)
  N->>N: at least one destination · the number takes the laundry's prefix
  opt Telegram
    O->>C: opens her link, presses « Démarrer »
    C->>N: webhook — /start rel_… (the secret token is checked first)
    N->>N: statement_by_token → the laundry · the chat is tied · the link stops working
  end
  loop every hour, at :05
    J->>N: statements_due(hour, day) — identifiers only
    loop each laundry whose hour has come
      N->>N: takes the day (once) · statementOf — figures by code, fixed sentences
      N->>C: the statement, on each channel it gave
      C-->>N: sent · refused, and why · not connected
      N->>N: keeps what it became
    end
  end
  O->>S: reads « Dernier envoi du soir », channel by channel
```

The statement is the one of « Aujourd'hui » (`specs/007-intelligence`): no model writes any of it.
It is off until the owner turns it on; whoever receives it reads the laundry's money, so deciding
where it goes is its own permission (`statement:send`, the owner alone by default).

Across organizations the job reads identifiers only — which laundries are due — through a
function that returns nothing else. Each statement is then computed and sent inside its own
organization, under row-level security.

« Envoyer le relevé maintenant » runs the same sending on demand, to check that it arrives; it
does not count as the evening's.
