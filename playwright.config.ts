import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

// E2E tests for the JIRA ETL Dashboard.
//
// The dev server is bootstrapped (or reused) via the webServer option below.
// `next dev` is used because the app is a client-rendered SPA and the dev server
// avoids a separate production build step. Locally an already-running dev server
// on :3000 is reused so iteration stays fast.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // `next dev` is not safe to drive from parallel workers: concurrent route
  // compilation churns webpack and triggers Fast Refresh full-reloads, which
  // abort in-flight requests and reset the page. Use a single worker so the
  // dev server compiles routes one at a time. (Raise this once the suite runs
  // against a production build via `next start`, which has no HMR.)
  workers: 1,
  reporter: isCI ? [['github'], ['html', { open: 'never' }]] : 'list',
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !isCI,
    // First boot runs the predev prisma setup + an initial Next.js compile,
    // so give it plenty of room.
    timeout: 180_000,
  },
});
