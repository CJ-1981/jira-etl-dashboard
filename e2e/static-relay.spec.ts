import { execSync } from 'node:child_process';
import path from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Static relay-mode e2e — exercises the full GitHub Pages distribution path:
 * statically served SPA → CORS to the local Python relay → SQLite dataset →
 * client-side KPI calculation. Runs via `npm run e2e:static`
 * (playwright.static.config.ts boots the static server + the real relay).
 */

// npm scripts (and thus Playwright) run from the package root.
const repoRoot = process.cwd();
const relayDbPath = path.join(repoRoot, 'data', 'relay-e2e.db');

test.describe('static relay mode', () => {
  test('relay-mode UI: server-only features hidden, client features work', async ({ page }) => {
    await page.goto('/jira-etl-dashboard/');
    await expect(page.getByRole('heading', { name: 'Jira ETL Dashboard' })).toBeVisible();

    // Connections: relay card instead of credential fields.
    await page.getByRole('tab', { name: 'Settings' }).click();
    await expect(page.getByText('Relay Connection')).toBeVisible();
    await expect(page.getByText(/local Python relay/)).toBeVisible();
    await expect(page.getByText('python scripts/jira_relay.py')).toBeVisible();
    await expect(page.getByPlaceholder('http://localhost:8765')).toBeVisible();
    await expect(page.getByPlaceholder('Your Jira API token')).toHaveCount(0);
    await expect(page.getByPlaceholder('user@company.com')).toHaveCount(0);

    // Storage tab is a server-only feature (SQLite/PostgreSQL selection).
    await expect(page.getByRole('tab', { name: 'Storage' })).toHaveCount(0);

    // Extraction: no server-side polling scheduler in relay mode.
    await page.getByRole('tab', { name: 'Data Center' }).click();
    await expect(page.getByText('Scheduled Pulling')).toHaveCount(0);

    // Holidays compute fully client-side (pure TS module, no relay needed).
    await page.getByRole('tab', { name: 'KPI Analytics' }).click();
    await page.getByRole('tab', { name: 'Holidays Calendar' }).click();
    await expect(page.getByText('German Holiday Calendar')).toBeVisible();
    await expect(page.getByText("New Year's Day").first()).toBeVisible();
  });

  test('full data flow over the real relay: connection → dataset → client-side KPIs', async ({ page }) => {
    await page.goto('/jira-etl-dashboard/');

    // 1. Create a connection through the credential-free relay form.
    await page.getByRole('tab', { name: 'Settings' }).click();
    await page.getByPlaceholder('e.g. Company Jira Cloud').fill('E2E Relay');
    await page.getByPlaceholder('e.g. PROJ, DEV, OPS').fill('E2E');
    await page.getByRole('button', { name: 'Save Jira Connection' }).click();
    // Saved Connections list renders the new card with a heading.
    await expect(page.getByRole('heading', { name: 'E2E Relay' })).toBeVisible();

    // 2. The dataset is keyed by the app-generated connection id — read it
    //    from localStorage and seed the relay's SQLite store with fixtures.
    const connectionId = await page.evaluate(
      () => JSON.parse(localStorage.getItem('cfg_jira_connections') || '[]')[0]?.id,
    );
    expect(connectionId, 'saved connection must have an id').toBeTruthy();
    execSync('python scripts/relay_e2e_fixture.py', {
      cwd: repoRoot,
      stdio: 'inherit',
      env: { ...process.env, RELAY_E2E_CONN: connectionId as string, JIRA_RELAY_DB: relayDbPath },
    });

    // 3. Select the connection — the master-dataset query fires over CORS to
    //    the relay and the page auto-populates the ticket list.
    await page.getByRole('combobox').filter({ hasText: 'Select a connection' }).click();
    await page.getByRole('option', { name: /E2E Relay/ }).click();
    await expect(page.getByText('✓ Using E2E Relay')).toBeVisible();

    // 4. Data Center: accumulated totals + ticket list come from the relay.
    await page.getByRole('tab', { name: 'Data Center' }).click();
    await expect(page.getByText('Total Unique Tickets:')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('5').first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'E2E-1' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'E2E-5' })).toBeVisible();

    // 5. KPI Analytics: the engine runs in the browser over the dataset —
    //    transition KPIs prove the changelog survived the SQLite round-trip.
    await page.getByRole('tab', { name: 'KPI Analytics' }).click();
    await expect(page.getByText('Metrics Overview')).toBeVisible({ timeout: 30_000 });
    const todoRow = page.getByRole('row', { name: /Status: To Do/ });
    await expect(todoRow).toBeVisible();
    await expect(todoRow).toContainText('1');
    const inProgressRow = page.getByRole('row', { name: /Status: In Progress/ });
    await expect(inProgressRow).toBeVisible();
    await expect(inProgressRow).toContainText('1');
    // Metrics table computed over the full dataset (row count rendered dynamically).
    await expect(page.getByText(/\d+ rows/)).toBeVisible();
  });
});
