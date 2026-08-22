import { test, expect } from '@playwright/test';
import { gotoHome, clickTab } from './helpers';

// StoragePanel config is UI + localStorage only. Its only network calls on the
// SQLite provider are GET /api/db/location and POST /api/jira/extract/storage,
// both of which hit the app's own local SQLite — no external service needed.

async function openStorage(page: import('@playwright/test').Page) {
  await gotoHome(page);
  await clickTab(page, 'Settings');
  await page.getByRole('tab', { name: 'Storage' }).click();
}

test.describe('Storage panel — provider selection & persistence', () => {
  test('shows both provider cards with Local SQLite active by default', async ({ page }) => {
    await openStorage(page);

    await expect(page.getByText('Local SQLite', { exact: true })).toBeVisible();
    await expect(page.getByText('PostgreSQL / Supabase', { exact: true })).toBeVisible();
    // The active-provider badge reflects the SQLite default.
    await expect(page.getByText('LOCAL SQLITE', { exact: true })).toBeVisible();
  });

  test('selecting PostgreSQL reveals the custom connection string input', async ({ page }) => {
    await openStorage(page);

    // Click the PostgreSQL card (an onClick div; clicking its title bubbles).
    await page.getByText('PostgreSQL / Supabase', { exact: true }).click();

    // Provider switches to PostgreSQL and the badge updates.
    await expect(page.getByText('POSTGRESQL', { exact: true })).toBeVisible();
    // The raw-URL connection string input + save button appear.
    await expect(page.getByPlaceholder('postgres://user:pass@host:port/db')).toBeVisible();
    await expect(page.getByText('-- Use Raw URL --', { exact: true })).toBeVisible();
  });

  test('session persistence switches toggle on and off', async ({ page }) => {
    await openStorage(page);

    await expect(page.getByText('Session Persistence')).toBeVisible();
    // The "Auto-save after extraction" switch is the first switch on the panel.
    const autoSave = page.getByRole('switch').first();
    await expect(autoSave).toHaveAttribute('aria-checked', 'true');

    await autoSave.click();
    await expect(autoSave).toHaveAttribute('aria-checked', 'false');

    await autoSave.click();
    await expect(autoSave).toHaveAttribute('aria-checked', 'true');
  });
});
