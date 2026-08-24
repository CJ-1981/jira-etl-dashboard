import type { Page } from '@playwright/test';

/**
 * Shared helpers for the JIRA ETL Dashboard e2e suite.
 *
 * The app is a client-rendered Next.js SPA ('use client' page) wrapped in a
 * QueryClientProvider. Each Playwright test gets a fresh browser context, so
 * localStorage starts empty — the app falls back to its defaults (no
 * connections, SQLite storage, dark theme) on every test without any cleanup.
 */

// Wait until React has hydrated the app shell. The brand heading and the tab
// triggers are present in the server-rendered HTML, so their mere visibility
// does not prove the client bundle is live — event handlers are attached only
// once hydration finishes, and clicks dispatched before then are silently
// dropped. `next dev` also performs one client-side revalidation right after
// the HMR socket connects, so give React a moment to settle. The top-level tab
// triggers are client-rendered, so one carrying React props (__reactProps$
// keys exist only on hydrated DOM nodes) proves handlers are attached.
async function waitForHydration(page: Page) {
  await page.waitForFunction(() => {
    const tab = document.querySelector('[role="tab"]');
    return !!tab && Object.keys(tab).some((key) => key.startsWith('__reactProps$'));
  }, undefined, { timeout: 15_000 }).catch(async (err) => {
    // A stalled dev server (mid-recompile) can delay the client bundle; fall
    // back to a full reload, which re-requests the chunks and almost always
    // lands on a warm build. Surface the original error if that still fails.
    await page.reload();
    await page.waitForFunction(() => {
      const tab = document.querySelector('[role="tab"]');
      return !!tab && Object.keys(tab).some((key) => key.startsWith('__reactProps$'));
    }, undefined, { timeout: 15_000 }).catch(() => {
      throw err;
    });
  });
}

// Navigate to the dashboard root and wait for the app shell to hydrate.
export async function gotoHome(page: Page) {
  // `domcontentloaded` instead of the default `load`: on a busy `next dev`
  // server a queued chunk compilation can hold the window load event open for
  // tens of seconds. Interactivity is gated explicitly by waitForHydration
  // below, so waiting for every subresource here buys nothing.
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });
  await waitForHydration(page);
}

// Click a top-level tab by its visible desktop label
// ("Data Center" | "KPI Analytics" | "Settings").
// Radix renders tab triggers with role="tab"; the mobile-only label span is
// display:none at the 1280px viewport, so the accessible name is the desktop
// label. Waits for hydration first so the click lands on live handlers even
// right after a hard navigation or page.reload().
export async function clickTab(page: Page, label: string) {
  await waitForHydration(page);
  await page.getByRole('tab', { name: label }).click();
}

// Auto-accept (or dismiss) the native window.confirm dialogs the app raises
// (e.g. deleting a connection or clearing the master dataset).
export function handleConfirms(page: Page, accept = true) {
  page.on('dialog', (dialog) => {
    if (dialog.type() === 'confirm') {
      dialog[accept ? 'accept' : 'dismiss']();
    } else {
      dialog.accept();
    }
  });
}

interface SeedConnectionInput {
  id?: string;
  name: string;
  baseUrl: string;
  email: string;
  apiToken: string;
  projectKeys?: string;
}

// Seed a Jira connection into localStorage BEFORE the app boots, via
// addInitScript. Avoids driving the connection form in specs that only need a
// connection present as a precondition. Re-applies on every navigation.
export function seedConnection(page: Page, conn: SeedConnectionInput) {
  const connection = {
    id: conn.id ?? 'seed-conn-' + Math.random().toString(36).slice(2, 10),
    name: conn.name,
    baseUrl: conn.baseUrl,
    email: conn.email,
    apiToken: conn.apiToken,
    projectKeys: conn.projectKeys ?? '',
    isActive: true,
  };
  page.addInitScript((entry) => {
    localStorage.setItem('cfg_jira_connections', JSON.stringify([entry]));
    // localConfig.get() JSON.parse()s every key, so the id must be stored as
    // a JSON string — a raw string makes getActiveConnectionId() return null.
    localStorage.setItem('cfg_active_connection_id', JSON.stringify(entry.id));
  }, connection);
}
