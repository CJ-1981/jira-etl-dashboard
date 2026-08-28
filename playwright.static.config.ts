import { defineConfig, devices } from '@playwright/test';

/**
 * Static relay-mode e2e — runs the GitHub Pages bundle (out/, built by
 * `npm run build:static`) against the real Python relay (scripts/jira_relay.py)
 * backed by a throwaway SQLite store. This is the only suite that exercises the
 * full static distribution path: Pages-style serving → CORS to localhost →
 * relay SQLite → client-side KPI calculation.
 *
 * Run: npm run e2e:static   (builds the static bundle first via pree2e hook)
 */

const STATIC_PORT = 4173;
const RELAY_PORT = 8765;
const BASE_PATH = '/jira-etl-dashboard';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'static-relay.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : 'list',
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${STATIC_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/serve-static.mjs',
      url: `http://127.0.0.1:${STATIC_PORT}${BASE_PATH}/`,
      reuseExistingServer: !process.env.CI,
      env: {
        PORT: String(STATIC_PORT),
        BASE_PATH,
        STATIC_DIR: 'out',
      },
    },
    {
      command: 'python scripts/jira_relay.py',
      url: `http://127.0.0.1:${RELAY_PORT}/health`,
      reuseExistingServer: !process.env.CI,
      env: {
        // Throwaway store; data/* is gitignored.
        JIRA_RELAY_DB: 'data/relay-e2e.db',
        JIRA_RELAY_PORT: String(RELAY_PORT),
        // CORS must allow exactly the static server's origin — deny-by-default
        // otherwise (the relay's security boundary).
        ALLOWED_ORIGIN: `http://127.0.0.1:${STATIC_PORT}`,
      },
    },
  ],
});
