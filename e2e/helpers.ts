import type { Page } from '@playwright/test';

/**
 * Shared helpers for the JIRA ETL Dashboard e2e suite.
 *
 * The app is a client-rendered Next.js SPA ('use client' page) wrapped in a
 * QueryClientProvider. Each Playwright test gets a fresh browser context, so
 * localStorage starts empty — the app falls back to its defaults (no
 * connections, SQLite storage, dark theme) on every test without any cleanup.
 */

// Navigate to the dashboard root and wait for the app shell to hydrate.
// The header brand title is rendered by the client bundle, so seeing it
// confirms hydration completed.
export async function gotoHome(page: Page) {
  await page.goto('/');
  await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });
}

// Click a top-level tab by its visible desktop label
// ("Data Center" | "KPI Analytics" | "Settings").
// Radix renders tab triggers with role="tab"; the mobile-only label span is
// display:none at the 1280px viewport, so the accessible name is the desktop
// label.
export async function clickTab(page: Page, label: string) {
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
    localStorage.setItem('cfg_active_connection_id', entry.id);
  }, connection);
}
