import { test, expect } from '@playwright/test';
import { gotoHome, clickTab } from './helpers';

// The Holidays panel fetches GET /api/holidays, which computes German public
// holidays from a pure local library (no Jira, no database). This makes it a
// genuine full-stack e2e target: the assertion exercises the real API +
// render path end to end, without any mocks or external services.

test.describe('Holidays Calendar — real API rendering', () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
    await clickTab(page, 'KPI Analytics');
    await page.getByRole('tab', { name: 'Holidays Calendar' }).click();
    await expect(page.getByText('German Holiday Calendar')).toBeVisible();
  });

  test('renders national holidays for the current year', async ({ page }) => {
    const year = new Date().getFullYear();

    // New Year's Day is always Jan 1 and is a national holiday in Germany.
    // Asserting this date proves the real /api/holidays round-trip rendered.
    await expect(page.getByText(`${year}-01-01`, { exact: true })).toBeVisible();
  });

  test('shows no regional holidays for the National selection', async ({ page }) => {
    await expect(page.getByText('No regional holidays for this selection')).toBeVisible();
  });

  test('renders regional holidays when a state is selected', async ({ page }) => {
    // Bayern observes regional holidays (e.g. Epiphany on Jan 6).
    await page.getByRole('combobox').click();
    await page.getByRole('option', { name: 'Bayern' }).click();

    // Once the fetch for region=BY resolves, the empty-state text disappears.
    await expect(page.getByText('No regional holidays for this selection')).toHaveCount(0);
    // A known Bayern regional holiday: Epiphany, Jan 6.
    const year = new Date().getFullYear();
    await expect(page.getByText(`${year}-01-06`, { exact: true })).toBeVisible();
  });

  test('updates the list when the year changes', async ({ page }) => {
    const prevYear = new Date().getFullYear() - 1;

    await page.getByPlaceholder('Year').fill(String(prevYear));
    await expect(page.getByText(`${prevYear}-01-01`, { exact: true })).toBeVisible();
  });

  test('rejects an out-of-range year with an inline validation error', async ({ page }) => {
    // The panel clamps years to 2000..current+5. A far-future year must show
    // the validation message and must NOT render any holiday rows.
    await page.getByPlaceholder('Year').fill('9999');

    await expect(page.getByText(/Year must be between 2000 and \d{4}/)).toBeVisible();
    // The year input is flagged invalid for assistive tech.
    await expect(page.getByPlaceholder('Year')).toHaveAttribute('aria-invalid', 'true');
    // No holiday from any year should be listed while the input is invalid.
    await expect(page.getByText(/-01-01$/, { exact: false })).toHaveCount(0);
  });
});
