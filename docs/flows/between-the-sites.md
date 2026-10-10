# Between the sites

```mermaid
flowchart TD
  R[A deposit received at a counter<br/>its plant is another site] --> W[« À envoyer » — counter → plant<br/>nextStop: derived, never typed]
  W --> S[transfers_send — a numbered slip T-0001<br/>each deposit is at the site it leaves from]
  S --> T((On the road))
  T --> A[transfers_receive — ticked on arrival, once]
  A -- found --> P[At the plant: the workshop does its steps]
  A -- not found --> M[Said missing: on the slip, the page, the deposit's history<br/>it travels nowhere until found]
  P --> Y[Ready] --> B[« À envoyer » — plant → its counter]
  B --> S2[A second slip] --> H[Received at its counter: it waits for its customer]
```

Where a deposit is, is read from its last slip: sent — on the road; received and ticked — at the
destination; received and not ticked — missing. Nothing is stored twice.

## What each site earns

```mermaid
flowchart LR
  O[(orders<br/>by site)] --> F[sales · pieces]
  Pm[(payments<br/>by site)] --> C[cashed]
  E[(expenses)] --> D[its own charges<br/>those that name it]
  E --> Sh[shared charges<br/>those that name no site]
  K[The owner's key:<br/>sales · pieces · equal] --> Al[allocate — to the franc,<br/>the parts add up]
  F --> Al
  Sh --> Al
  C --> Rs[result = cashed − own charges − its part]
  D --> Rs
  Al --> Rs
  Cr[(credit paid ahead,<br/>not spent yet)] --> Tot[Σ results + prepaid = the laundry's result]
  Rs --> Tot
```

A partner's commission is a percentage of what its point received. It is said on the point's
line and not deducted: when the laundry pays it, it records an expense of that site — and the
result moves then, once.
