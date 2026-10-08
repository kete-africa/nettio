# The app's own design (optional)

A Kete App wears `kete` by default, `workspace` if it serves an enterprise
(`src/platform/app.ts`), or its own design (doctrine D-038), in the same three layers:

1. `design/DESIGN.md` — its base tokens, in the DESIGN.md format, linted without warning;
2. `design/semantic.ts` — `export const name = 'my-app'` and `export const mapping`, its
   `SemanticMapping` (@kete/design): which base color each semantic token takes, per mode;
3. `pnpm design:generate` writes `src/styles/design.gen.css`, refused if a contrast fails; import it
   in `src/styles/app.css`, and set `DESIGN` to its name.

The components of @kete/design wear it unchanged. The common contract does not change: a design
sets how the app looks, never how it behaves.
