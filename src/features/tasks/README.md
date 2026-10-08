# Tasks — the example feature

Every layer of a Kete App feature, small enough to read in ten minutes, and to replace by the
app's first real feature.

```mermaid
flowchart LR
  UI[ui/ · routes] --> F[functions.ts<br/>server functions]
  MCP[/mcp · agents/] --> R
  F --> R[registry<br/>capabilities.ts]
  R -->|rights: policies.ts| C[commands/<br/>journaled]
  R -->|level 3, an agent| D[draft → /verification]
  C --> DOM[domain/<br/>pure rules]
  C --> INF[infrastructure/<br/>tasks table, RLS]
```

| Capability       | Level | An agent…                                   |
| ---------------- | ----- | ------------------------------------------- |
| `tasks_list`     | 1     | reads them, shown as a table in its copilot |
| `tasks_complete` | 2     | completes one; the person may reopen it     |
| `tasks_create`   | 3     | prepares a draft; the person validates it   |

Lifecycle: `open` → `done` (complete-task) → `open` (reopen-task).
