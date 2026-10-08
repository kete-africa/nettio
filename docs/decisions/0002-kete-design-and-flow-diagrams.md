---
status: accepted
date: 2026-10-08
---

# The `kete` design as it is, and a graph library for the diagram of the business

## Context and Problem Statement

Nettio needs a design system, and a launderer must see the flow of his business as a diagram drawn
from his settings (sites, services and their routes, the life of a deposit).

## Considered Options

- An own design for Nettio (doctrine D-038 allows it).
- `@kete/design`, design `kete`, as it exists.
- For the diagram: the `OrgChart` of `@kete/design`, hand-written SVG, Mermaid rendered in the
  browser, or `@xyflow/react`.

## Decision Outcome

- **Design**: `@kete/design`, design `kete`, with no own charter and no base component of
  Nettio's. The author asked for the existing system; an own design would be a cost with no user
  need behind it.
- **Diagram**: `@xyflow/react`. `OrgChart` draws a tree, not a graph with routes and merges;
  hand-written SVG would rebuild pan, zoom and edge routing; Mermaid cannot open a node's setting on
  a touch. The nodes and edges are styled with the semantic tokens of `@kete/design` only.

### Consequences

- Good, because Nettio looks like every Kete App and receives the design's improvements.
- Good, because the diagram is interactive: a node opens its setting.
- Neutral, because `@xyflow/react` is a client-only dependency: the diagram is loaded on its page
  only.
- To raise to `kete-core`: a flow-diagram component in `@kete/design`, if a second app needs one.
