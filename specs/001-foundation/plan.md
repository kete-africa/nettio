# Implementation Plan: 001-foundation

## Constitution check

| Principle | How this feature meets it |
|---|---|
| I. The pain decides | Product documents first (`docs/product/`), roadmap with proofs |
| II. Figures by code | The diagram and the starter are pure functions, tested alone |
| III. The owner decides | No price proposed; configuration by an agent is a draft |
| IV. The laundry configures itself | Everything here is data of the organization |
| V. One organization | Row-level security in each creating migration; isolation tests |
| VI. Named commands | One command per gesture, exposed as a capability |
| VIII. The existing design | `@kete/design` (`Shell`, `PageHeader`, `DataTable`, `Drawer`…) |
| IX. Documentation | Feature READMEs, `docs/flows/setting-up-a-business.md` |

## Structure

```
src/features/business/     settings, sites, team, rights, the start, the diagram
  business.record.ts       schemas and types
  domain/                  roles.ts · sites.ts · starter.ts · flow.ts (pure)
  infrastructure/          business.tables.ts (SQL + row-level security)
  commands.ts              set-up-business · change-settings · save-site ·
                           set-staff-role · set-role-permissions
  policies.ts · capabilities.ts · functions.ts · ui/ · README.md
src/features/catalog/      articles, steps, services and routes, prices, packs
  (same shape)
src/platform/rights.ts     Compte Kete role → business role → permissions; the center decides
                           when it manages the app
src/platform/screen.ts     the person on a screen; `perform` runs a capability and maps rule
                           errors to codes the screens word
src/lib/shell.tsx          the shell by rights, the phone tab bar
```

## Data

`settings`, `sites`, `staff`, `role_permissions` (migration `0001_business`); `articles`, `steps`,
`services`, `service_steps`, `prices`, `packs` (migration `0002_catalog`). The template's `tasks`
example is removed; no migration ever ran on Nettio's databases.

## Rights

1. The center manages the app → its grants decide (chassis contract).
2. Compte Kete `owner` or `admin` → every permission.
3. Compte Kete `member` → the permissions ticked for her business role (`staff.role`), the
   defaults of the code while the organization has ticked nothing; none without a role.

## Risks

- `@xyflow/react` is client-only: the diagram mounts after hydration, with a text equivalent
  rendered on the server (the same routes as a list).
- The team list needs a name per person: Nettio keeps the name shown at her last sign-in, nothing
  else of her profile.
