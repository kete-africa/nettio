import { fileURLToPath, URL } from 'node:url';
import { defineProject } from 'vitest/config';

export default defineProject({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    name: 'nettio',
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // With KETE_TEST_POSTGRES=container, one Postgres for the whole run (@kete/testing).
    globalSetup: ['@kete/testing/global-setup'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
