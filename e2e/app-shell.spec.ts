import { test, expect } from '@playwright/test';
import { gotoHome, clickTab } from './helpers';

test.describe('App shell — navigation, tabs, theme, keyboard', () => {
  test('loads the dashboard shell with header and three tabs', async ({ page }) => {
    await gotoHome(page);

    await expect(page.getByRole('heading', { name: 'Jira ETL Dashboard' })).toBeVisible();
    // Desktop labels render at the 1280px viewport (mobile-only spans are hidden).
    await expect(page.getByRole('tab', { name: 'Data Center' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Settings' })).toBeVisible();
  });

  test('defaults to the Data Center tab', async ({ page }) => {
    await gotoHome(page);

    const dataCenterTab = page.getByRole('tab', { name: 'Data Center' });
    await expect(dataCenterTab).toHaveAttribute('data-state', 'active');
    // ExtractPanel renders a banner when no connection is selected.
    await expect(page.getByText(/no connection selected/i)).toBeVisible();
  });

  test('switches top-level tabs via click', async ({ page }) => {
    await gotoHome(page);

    await clickTab(page, 'KPI Analytics');
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toHaveAttribute('data-state', 'active');
    // KpiDashboard renders a Recalculate button (its CardTitle is a plain div,
    // not a heading, so assert on the button instead).
    await expect(page.getByRole('button', { name: 'Recalculate' })).toBeVisible();

    await clickTab(page, 'Settings');
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('data-state', 'active');
    // Settings → Connections panel empty state (no connections seeded).
    await expect(page.getByText('No Jira connections configured yet')).toBeVisible();
  });

  test('switches top-level tabs via keyboard shortcuts 1 / 2 / 3', async ({ page }) => {
    await gotoHome(page);
    // Click the non-interactive brand heading so focus lands on document.body,
    // where the bare-key shortcuts are allowed to fire.
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).click();

    await page.keyboard.press('2');
    await expect(page.getByRole('tab', { name: 'KPI Analytics' })).toHaveAttribute('data-state', 'active');

    await page.keyboard.press('3');
    await expect(page.getByRole('tab', { name: 'Settings' })).toHaveAttribute('data-state', 'active');

    await page.keyboard.press('1');
    await expect(page.getByRole('tab', { name: 'Data Center' })).toHaveAttribute('data-state', 'active');
  });

  test('theme toggle switches dark/light and persists across reload', async ({ page }) => {
    await gotoHome(page);

    // classList.contains('dark') checks the exact token, ignoring the
    // Tailwind `dark:` variant prefixes that live in the <html> base className.
    const isDark = async () =>
      page.evaluate(() => document.documentElement.classList.contains('dark'));

    // The store default theme is dark. The `dark` token is applied by a
    // post-mount React effect (the inline theme-init script only adds it when
    // prefers-color-scheme is dark, which headless Chromium is not by default),
    // so poll for it rather than asserting immediately.
    await expect.poll(isDark, { timeout: 10000 }).toBe(true);

    // The theme toggle is the last button in the header (no connection selector
    // is rendered when no connections are configured).
    await page.locator('header button').last().click();
    await expect.poll(isDark, { timeout: 10000 }).toBe(false);

    // Reload — the persisted 'light' theme is read on mount.
    await page.reload();
    await page.getByRole('heading', { name: 'Jira ETL Dashboard' }).waitFor({ state: 'visible' });
    await expect.poll(isDark, { timeout: 10000 }).toBe(false);
  });

  test('sub-menu toggle shows and hides the nested sub-tabs', async ({ page }) => {
    await gotoHome(page);
    // Data Center is active by default; its sub-tabs are visible by default.
    await expect(page.getByRole('tab', { name: 'Jira Extraction' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Data Export' })).toBeVisible();

    // Collapse the sub-menu.
    await page.getByRole('button', { name: 'Sub-Menu' }).click();
    await expect(page.getByRole('tab', { name: 'Jira Extraction' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Data Export' })).toHaveCount(0);

    // Expand again.
    await page.getByRole('button', { name: 'Sub-Menu' }).click();
    await expect(page.getByRole('tab', { name: 'Jira Extraction' })).toBeVisible();
  });
});
