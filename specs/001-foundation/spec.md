# Feature Specification: The foundation — the launderer sets up his business

**Feature Branch**: `001-foundation`

**Created**: 2026-10-08

**Status**: Implemented

**Input**: « Permets qu'un pressing puisse configurer ce qu'il faut et avoir des schémas graphiques
qui montrent le flux de ces pressings. » — Nettio rebuilt from zero on the Kete template.

## User Scenarios & Testing

### User Story 1 — The owner starts his business (Priority: P1)

Afi signs in with her Compte Kete for the first time. Nettio asks three things: the name of her
laundry, where she stands (« je démarre », « pressing installé », « plusieurs points »), and
whether she works alone or with a team. Nettio prepares her sites, the usual steps, four services
with their routes and twelve articles. No price is proposed.

**Why this priority**: nothing else exists before the business does.

**Independent Test**: a new organization goes from nothing to a set-up business in one gesture, and
a second start is refused.

**Acceptance Scenarios**:

1. **Given** a new organization, **When** its owner starts as « plusieurs points », **Then** a
   plant and a counter attached to it exist, with four services, their routes, and no price.
2. **Given** a set-up business, **When** anyone starts it again, **Then** it is refused and nothing
   changes.
3. **Given** a member who is not the owner, **When** the business is not set up, **Then** she is
   told so and cannot start it.

### User Story 2 — The owner sees his business as a diagram (Priority: P1)

The diagram shows the sites (which counter sends to which plant), each service with its route step
by step, and the life of a deposit. It is drawn from the settings and redrawn at each change;
touching a node opens its setting.

**Independent Test**: the diagram of a business is a pure function of its settings.

**Acceptance Scenarios**:

1. **Given** a counter attached to a plant, **Then** the diagram links the counter to the plant.
2. **Given** a service whose route is Tri → Lavage → Repassage, **Then** its lane shows these three
   steps in this order, and removing a step from the route removes it from the lane.
3. **Given** a service with no step, **Then** its lane says it goes from « reçu » to « prêt »
   directly.

### User Story 3 — The owner configures the catalogue (Priority: P1)

Articles, steps, services (nature, pricing per piece or per kilo, route), prices (article ×
service, or per kilo), packs (pieces or weight, quota, price, eligible services).

**Acceptance Scenarios**:

1. **Given** a per-piece service, **When** a price is set for an article, **Then** the couple can
   be sold; removing the price means it is not sold.
2. **Given** a per-kilo service, **Then** it has one price per kilo and none per article.
3. **Given** a route naming a step of another organization or an unknown step, **Then** it is
   refused.
4. **Given** a pack, **Then** it has a mode, a positive quota and price, and the services it
   admits (all when none is named).

### User Story 4 — The owner gives each person a role, and each role its rights (Priority: P2)

A person invited at the Compte Kete signs in: she appears in the team as « waiting for a role »
and sees nothing of the business. The owner gives her a role and her sites, and ticks what each
role may do. Rights are checked on the server for every surface.

**Acceptance Scenarios**:

1. **Given** a member with no role, **Then** every capability is refused to her and to an agent
   acting for her.
2. **Given** a member with the counter role, **Then** she reads the business and cannot manage the
   catalogue.
3. **Given** the owner unticks a permission of a role, **Then** it is refused to that role at the
   next request.
4. **Given** the owner role, **Then** it always holds every permission: an owner cannot lock
   himself out.
5. **Given** an organization whose rights are managed at Kete Enterprise, **Then** the center's
   grants decide.

### Edge Cases

- A site code used twice in the organization is refused.
- A counter may only be attached to a site that processes (plant or counter-plant) of the same
  organization.
- The last active site that receives deposits cannot be deactivated.
- A catalogue change never touches another organization (row-level security, tested per table).

## Requirements

- **FR-001**: The business is set up once, by a person holding `settings:manage`.
- **FR-002**: Sites, steps, articles, services and routes, prices, packs, settings, roles and
  rights are data of the organization, changed by named commands.
- **FR-003**: The diagram is computed by a pure function and rendered with `@xyflow/react`, styled
  with `@kete/design` tokens.
- **FR-004**: Nettio never proposes a price.
- **FR-005**: Every table carries its row-level security in its creating migration.
- **FR-006**: Every gesture is a capability with a permission and an autonomy; an agent that
  changes the configuration prepares a draft.
- **FR-007**: The shell shows only the entries the person may open; on a phone, a tab bar.
- **FR-008**: No hard-coded user-visible string; French and English.

## Success Criteria

- **SC-001**: A launderer sets up his business alone in under fifteen minutes and recognizes it on
  the diagram (to be observed with the pilot — not yet proven).
- **SC-002**: The checks of the CI workflow pass.
