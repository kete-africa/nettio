# A site that runs without its owner

## A clerk asks, a manager decides

```mermaid
sequenceDiagram
  participant C as Clerk (counter)
  participant N as Nettio
  participant M as Manager
  C->>N: « Demander une validation » on a deposit<br/>approvals_request (discount · cancel · refund, reason)
  N->>N: checkRequest against the deposit — nothing changes
  N-->>M: « À faire » and « Gérant » — and, by message,<br/>« Mawuli demande : Remise 500 F CFA sur A-0001… OUI 12 / NON 12 »
  alt on a screen
    M->>N: « Accorder » or « Refuser » — approvals_decide (level 4, confirmed)
  else on her WhatsApp or Telegram
    M->>N: « OUI 12 » — decidedByMessage, with her role's rights
  end
  N->>N: the request is locked; the rule is checked again
  alt granted
    N->>N: cancel-order · refund-payment · the discount<br/>in the manager's name, in the deposit's history
  else refused or stopped by a rule
    N->>N: the deposit does not change
  end
  N-->>C: her request reads « Accordé » or « Refusé »
```

An agent only prepares a request or a decision: both are drafts until a person confirms.

## One device, several people

```mermaid
flowchart TD
  D[The device is signed in by Afi<br/>kete_session — her Compte Kete] --> R{The laundry allows<br/>the switch?}
  R -- no --> X[« Changer de personne » says so]
  R -- yes --> P[Mawuli picks her name, types her code]
  P --> V[verifyCode — salted hash<br/>5 wrong tries: locked 15 min]
  V -- wrong --> P
  V -- right --> K[nettio_acting — signed cookie, 12 h<br/>org · person · the device's owner]
  K --> A[Every request: personOf = Mawuli<br/>rights of her business role · no token]
  A --> J[Her gestures are signed Mawuli in the journal]
  A --> B[« Rendre la main à Afi » clears the cookie]
```

The code is never a command's input — the journal keeps inputs. It is checked by a server
function and stored as `salt:scrypt`. The cookie is worth nothing on another session, in another
organization, or once the laundry turns the switch off.

## A deposit nobody comes back for

```mermaid
flowchart LR
  S[Ready, beyond the free days] --> F[Charge the storage fee<br/>the laundry's own fee · 0 = none]
  S --> W[Warn the customer, once<br/>the date is kept]
  W --> T{The laundry's delay<br/>has run out?}
  T -- no --> S
  T -- yes --> O[Take it out of the laundry<br/>where the clothes went]
  O --> E[Closed: what was paid stays earned,<br/>what was owed is given up as a discount]
  F --> I[On the receipt, the deposit and the invoice:<br/>« Frais de garde », its own line]
```

Nettio proposes no fee and no delay: both are the laundry's decisions, on « Gérant », under
« Vos règles ».
