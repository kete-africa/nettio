# Rights granted in Kete Enterprise

Each feature declares its permissions in its `policies.ts`, with their words in French and English
and the Compte Kete roles that hold them by default (kete-core spec 049). The manifest describes
them; Kete Enterprise lets an administrator tick them for a role, granted to positions.

```mermaid
sequenceDiagram
  participant P as Person (screen, copilot or app)
  participant A as App
  participant E as Kete Enterprise
  P->>A: a gesture, with her token
  A->>E: GET /v1/apps/{product}/grants (her token)
  alt the organization manages the app's rights there
    E-->>A: managed: true · what she holds, and where
    A->>A: her grants decide
  else not managed, no center, or no answer
    E-->>A: managed: false (or nothing)
    A->>A: her last grants known (24 h), else her role's defaults
  end
  A->>A: holds(permission) for the screen, the MCP tool, the API
```

- **Five minutes**: the grants are kept per token (by its hash), so a right ticked or withdrawn in
  Kete Enterprise applies within five minutes.
- **Only what the app declares**: a permission the app does not know is ignored.
- **An agent never holds more** than the person it acts for: the grants are hers.
