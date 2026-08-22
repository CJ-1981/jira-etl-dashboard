import { test, expect } from '@playwright/test';
import { gotoHome, clickTab, handleConfirms } from './helpers';

// ConnectionsPanel persists to localStorage (cfg_jira_connections); saving a
// connection touches no external service, so these flows are fully testable
// end-to-end without a Jira instance. The "Remove" button calls
// DELETE /api/jira/connections/{id}, which clears the connection's extraction
// data from the default SQLite DB (a no-op when none exists) before the panel
// drops the config from localStorage.

async function fillConnectionForm(
  page: import('@playwright/test').Page,
  overrides: { name?: string; baseUrl?: string } = {},
) {
  await page.getByPlaceholder('e.g. Company Jira Cloud').fill(overrides.name ?? 'Test Jira Cloud');
  await page.getByPlaceholder('https://your-domain.atlassian.net').fill(overrides.baseUrl ?? 'https://test.atlassian.net');
  await page.getByPlaceholder('user@company.com').fill('tester@company.com');
  await page.getByPlaceholder('Your Jira API token').fill('dummy-api-token-123');
  await page.getByPlaceholder('e.g. PROJ, DEV, OPS').fill('TEST');
}

test.describe('Connections panel — Jira connection CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
    await clickTab(page, 'Settings');
    // Settings defaults to the Connections sub-tab.
    await expect(page.getByText('No Jira connections configured yet')).toBeVisible();
  });

  test('shows the empty state and the add-connection form', async ({ page }) => {
    // CardTitle is a plain div (data-slot="card-title"), not a heading.
    await expect(page.getByText('Add Jira Connection', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Company Jira Cloud')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save Jira Connection' })).toBeVisible();
  });

  test('adds a connection and surfaces it in the header selector', async ({ page }) => {
    await fillConnectionForm(page, { name: 'My Test Jira' });
    await page.getByRole('button', { name: 'Save Jira Connection' }).click();

    // The saved-connections list now shows the new connection.
    await expect(page.getByRole('heading', { name: 'My Test Jira' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Test', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();

    // The header connection selector now renders (connections.length > 0).
    await expect(page.locator('header').getByRole('combobox')).toBeVisible();
  });

  test('persists a saved connection across a page reload', async ({ page }) => {
    await fillConnectionForm(page, { name: 'Persistent Jira' });
    await page.getByRole('button', { name: 'Save Jira Connection' }).click();
    await expect(page.getByRole('heading', { name: 'Persistent Jira' })).toBeVisible();

    await page.reload();
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });
    // Settings tab state is restored from localStorage on mount.
    await clickTab(page, 'Settings');

    await expect(page.getByRole('heading', { name: 'Persistent Jira' })).toBeVisible();
  });

  test('edits an existing connection and renames it', async ({ page }) => {
    await fillConnectionForm(page, { name: 'Original Name' });
    await page.getByRole('button', { name: 'Save Jira Connection' }).click();
    await expect(page.getByRole('heading', { name: 'Original Name' })).toBeVisible();

    // Open the edit form.
    await page.getByRole('button', { name: 'Edit', exact: true }).click();

    // The form is pre-filled and switches to update mode.
    await expect(page.getByText('Edit Jira Connection', { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder('e.g. Company Jira Cloud')).toHaveValue('Original Name');
    await expect(page.getByRole('button', { name: 'Update Connection' })).toBeVisible();

    // Rename and save.
    await page.getByPlaceholder('e.g. Company Jira Cloud').fill('Renamed Jira');
    await page.getByRole('button', { name: 'Update Connection' }).click();

    await expect(page.getByRole('heading', { name: 'Renamed Jira' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Original Name' })).toHaveCount(0);
  });

  test('Remove raises a confirm dialog; dismissing keeps the connection', async ({ page }) => {
    await fillConnectionForm(page, { name: 'Keep Me' });
    await page.getByRole('button', { name: 'Save Jira Connection' }).click();
    await expect(page.getByRole('heading', { name: 'Keep Me' })).toBeVisible();

    // Dismiss the native confirm() — the connection must remain.
    handleConfirms(page, false);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Keep Me' })).toBeVisible();
  });

  test('Remove accepts the confirm dialog and deletes the connection', async ({ page }) => {
    await fillConnectionForm(page, { name: 'Delete Me' });
    await page.getByRole('button', { name: 'Save Jira Connection' }).click();
    await expect(page.getByRole('heading', { name: 'Delete Me' })).toBeVisible();

    // Accept the native confirm() — the route clears DB data (a no-op here,
    // no extractions exist) and the panel drops the config from localStorage.
    handleConfirms(page, true);
    await page.getByRole('button', { name: 'Remove', exact: true }).click();

    // The connection is removed from the list and the empty state returns.
    await expect(page.getByRole('heading', { name: 'Delete Me' })).toHaveCount(0);
    await expect(page.getByText('No Jira connections configured yet')).toBeVisible();

    // Persisted: still gone after reload.
    await page.reload();
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });
    await clickTab(page, 'Settings');
    await expect(page.getByText('No Jira connections configured yet')).toBeVisible();
  });
});
