import { existsSync } from 'node:fs';
import { generateAppDesign } from '@kete/design/generate';
import type { SemanticMapping } from '@kete/design';

// An app's own design (doctrine D-038): design/DESIGN.md (its base tokens) and design/semantic.ts
// (its mapping), generated into src/styles/design.gen.css with the same contrast checks as Kete's.
// Without them, the app wears `kete` or `workspace` (src/platform/app.ts): nothing to generate.
const designMd = 'design/DESIGN.md';
if (!existsSync(designMd)) {
  console.log('This app wears one of Kete’s designs: nothing to generate.');
  process.exit(0);
}
const own = (await import('../design/semantic.ts' as string)) as {
  name: string;
  mapping: SemanticMapping;
};
const result = generateAppDesign({
  name: own.name,
  designMd,
  mapping: own.mapping,
  css: 'src/styles/design.gen.css',
  tokens: 'design/tokens.gen.json',
  check: process.argv.includes('--check'),
});
for (const message of result.messages) console.error(message);
if (!result.ok) process.exit(1);
console.log(`The ${own.name} design meets its contrasts.`);
