import { test, expect } from '@playwright/test';
import { gotoHome } from './helpers';

// Simple mode: the default single combined view. Fresh storage (no seeded
// cfg_ui_mode) must land in simple mode with the first-run wizard; expert
// storage keeps the two-tab shell (covered by app-shell.spec.ts).

test.describe('Simple mode', () => {
  test('fresh storage defaults to simple mode with the setup wizard', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });

    // No Data Center tab — the KPI Analytics tab remains as the minimum view
    // (it is the way back when the settings gear is used).
    await expect(page.getByRole('tab', { name: 'Data Center' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toBeVisible();

    // First-run wizard: no connection configured yet.
    await expect(page.getByText('Welcome to Jira ETL Dashboard')).toBeVisible();
    await expect(page.getByText('Set up Jira connection')).toBeVisible();
    await expect(page.getByText('Try demo data').first()).toBeVisible();
  });

  test('wizard: Set up Jira connection opens Settings → Connections', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });

    await page.getByText('Set up Jira connection').click();
    await expect(page.getByText('Welcome to Jira ETL Dashboard')).not.toBeVisible();
    // Settings area opens on the always-visible Connections sub-tab.
    await expect(page.getByRole('tab', { name: 'Connections' })).toBeVisible();
    // The KPI Analytics tab remains visible as the way back to the dashboard.
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toBeVisible();
  });

  test('wizard: Try demo data loads the demo dataset into the dashboard', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });

    await page.getByText('Try demo data').first().click();
    await expect(page.getByText('Welcome to Jira ETL Dashboard')).not.toBeVisible();

    // The extraction bar reflects the demo connection (the success toast also
    // mentions "demo data", hence exact matching)...
    await expect(page.getByText('Demo data', { exact: true })).toBeVisible();
    // ...and the KPI dashboard renders with the minimal plugin set visible.
    await expect(page.getByRole('button', { name: 'Recalculate' })).toBeVisible();
  });

  test('extraction bar: quick window + Run Extraction (demo connection)', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });
    await page.getByText('Try demo data').first().click();

    // Pull the last 7 days through the bar's quick preset.
    await page.getByRole('button', { name: /last 7 days/i }).click();
    await page.getByRole('button', { name: /run extraction/i }).click();

    // The pull runs against the demo connection; the bar reports completion
    // via the extraction toast and the master dataset stays in demo mode.
    await expect(page.getByText('Demo data', { exact: true })).toBeVisible();
  });

  test('sub-menu and Metrics Overview start collapsed in simple mode', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });
    await page.getByText('Try demo data').first().click();

    // Sub-menu collapsed: the nested sub-tabs are not rendered...
    await expect(page.getByRole('tab', { name: 'Plugins Configuration' })).toHaveCount(0);
    // ...and the Sub-Menu toggle can expand them.
    await page.getByRole('button', { name: 'Sub-Menu' }).click();
    await expect(page.getByRole('tab', { name: 'Plugins Configuration' })).toBeVisible();

    // Metrics Overview collapsed: the table body is hidden, only the header +
    // row count show. Expanding it must reveal the data table.
    await expect(page.getByText(/rows\)/)).toBeVisible();
    await page.getByRole('button', { name: /Metrics Overview/ }).click();
    await expect(page.getByRole('button', { name: /Export CSV/i })).toBeVisible();
  });

  test('mode switch returns the expert two-tab shell', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });

    // Dismiss the wizard first — its modal overlay blocks header controls.
    await page.getByRole('button', { name: 'Skip for now' }).click();
    await expect(page.getByText('Welcome to Jira ETL Dashboard')).not.toBeVisible();

    // Toggle to expert via the header switch.
    await page.getByRole('switch', { name: 'Toggle expert mode' }).click();
    await expect(page.getByRole('tab', { name: 'Data Center' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toBeVisible();

    // And back to simple — the Data Center tab disappears, KPI Analytics stays.
    await page.getByRole('switch', { name: 'Toggle expert mode' }).click();
    await expect(page.getByRole('tab', { name: 'Data Center' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toBeVisible();
  });

  test('expert-seeded storage keeps the classic two-tab shell', async ({ page }) => {
    await gotoHome(page, { mode: 'expert' });
    await expect(page.getByRole('tab', { name: 'Data Center' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toBeVisible();
    // No wizard in expert mode.
    await expect(page.getByText('Welcome to Jira ETL Dashboard')).toHaveCount(0);
  });
});
