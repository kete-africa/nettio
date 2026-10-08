import { existsSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from '@playwright/test';

// Nettio's screens end to end: the production build, on the Neon "test" branch. Sessions are
// signed with the test session secret (the Compte Kete is not needed to prove the screens);
// KETE_CHROMIUM lets a machine without the bundled browser use its own.
const localEnv = fileURLToPath(new URL('./.env', import.meta.url));
if (existsSync(localEnv)) process.loadEnvFile(localEnv);

export const PORT = 3402;
export const SESSION_SECRET = 'e2e-session-secret-of-at-least-32-characters';

for (const name of ['KETE_TEST_APP_URL', 'KETE_TEST_OWNER_URL']) {
  if (!process.env[name]) throw new Error(`${name} must be set (see .env.example).`);
}

export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  // The "test" branch is a remote database: a gesture may take a few seconds from a laptop.
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 375, height: 812 },
    locale: 'fr-FR',
    launchOptions: process.env.KETE_CHROMIUM ? { executablePath: process.env.KETE_CHROMIUM } : {},
  },
  webServer: {
    // The build first: it generates the messages the migrations' code imports.
    command: `pnpm build && pnpm db:migrate && pnpm exec srvx serve --entry dist/server/server.js --static ${fileURLToPath(new URL('./dist/client', import.meta.url))} --prod --port ${PORT}`,
    port: PORT,
    env: {
      DATABASE_URL: process.env.KETE_TEST_APP_URL ?? '',
      OWNER_DATABASE_URL: process.env.KETE_TEST_OWNER_URL ?? '',
      PUBLIC_URL: `http://localhost:${PORT}`,
      KETE_ACCOUNT_URL: 'http://localhost:9',
      KETE_CLIENT_ID: 'e2e',
      KETE_CLIENT_SECRET: 'e2e',
      SESSION_SECRET,
      ENTERPRISE_API_URL: '',
    },
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
