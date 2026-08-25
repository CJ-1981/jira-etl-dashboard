import { test, expect, type Page } from '@playwright/test';
import { gotoHome, clickTab, seedConnection } from './helpers';

// E2E coverage for the KPI Analytics tab (KpiDashboard + sub-tabs).
//
// Everything here runs WITHOUT a real Jira connection or extracted data:
//   - The shell, empty-state, sub-tab navigation and console-guard tests use a
//     pristine context (no connections, empty localStorage).
//   - The add/remove-visualization test seeds a connection entry into
//     localStorage only (never contacts Jira) and intercepts the app's own
//     API routes with canned payloads, so it stays hermetic.
//
// Empirically verified against src/components/dashboard/KpiDashboard.tsx:
//   - DashboardHeader always renders (title, Recalculate/Print, Filters button,
//     Analysis Period + Quick Presets, and the KpiFilterPanel which defaults to
//     open — the "Filters area").
//   - MetricsOverview / widgets / VisualizationsSection render ONLY when
//     filteredKpiResults.length > 0. In the true empty state a
//     "No KPI results yet" card is shown instead, so the Visualizations
//     heading + "Add Visualization" button are exercised in the mocked
//     add/remove test below rather than asserted against an empty dashboard.

// ─── Console guard ──────────────────────────────────────────────────────────
// Regression net for two recent hotfixes:
//   1. duplicate React keys in the chart list ("Encountered two children with
//      the same key" console error), and
//   2. QueryClientProvider mis-wiring ("No QueryClient set" / crash on load).
// Both are page-load-level issues only visible through the browser console.

const FORBIDDEN_CONSOLE_PATTERNS: RegExp[] = [
  /encountered two children with the same key/i,
  /no queryclient set/i,
  // React error-boundary / crash markers (dev + prod builds).
  /the above error occurred/i,
  /minified react error/i,
  // KpiErrorBoundary's componentDidCatch log — the boundary fired somewhere.
  /kpi component error/i,
];

interface ConsoleGuard {
  consoleErrors: string[];
  pageErrors: string[];
}

// Start collecting console errors and uncaught page errors. Call BEFORE any
// navigation so nothing is missed.
function attachConsoleGuard(page: Page): ConsoleGuard {
  const guard: ConsoleGuard = { consoleErrors: [], pageErrors: [] };
  page.on('console', (msg) => {
    if (msg.type() === 'error') guard.consoleErrors.push(msg.text());
  });
  page.on('pageerror', (error) => guard.pageErrors.push(String(error)));
  return guard;
}

function expectCleanConsole(guard: ConsoleGuard, scope: string) {
  const forbidden = guard.consoleErrors.filter((msg) =>
    FORBIDDEN_CONSOLE_PATTERNS.some((re) => re.test(msg))
  );
  expect(
    forbidden,
    `${scope}: forbidden console errors found:\n${forbidden.join('\n')}`
  ).toEqual([]);
  expect(
    guard.pageErrors,
    `${scope}: uncaught page errors found:\n${guard.pageErrors.join('\n')}`
  ).toEqual([]);
  // Any console error is surfaced loudly for triage but only the patterns
  // above are hard failures: `next dev` itself can emit unrelated one-off
  // errors (Fast Refresh reloads, version-staleness notices) that are not app
  // regressions.
  if (guard.consoleErrors.length > 0) {
    console.log(`${scope}: non-forbidden console errors observed:\n${guard.consoleErrors.join('\n')}`);
  }
}

// Navigate home and open the KPI Analytics top-level tab. Retries the click
// once: while src/ is being edited, `next dev` Fast Refresh can trigger a full
// page reload right after the click, resetting the tab list to its default.
async function gotoKpiAnalytics(page: Page) {
  await gotoHome(page);
  const tab = page.getByRole('tab', { name: 'KPI Analytics' });
  for (let attempt = 0; attempt < 2; attempt++) {
    await clickTab(page, 'KPI Analytics');
    const state = await tab.getAttribute('data-state').catch(() => null);
    if (state === 'active') return;
    await page.waitForTimeout(1000);
  }
  await expect(tab).toHaveAttribute('data-state', 'active');
}

test.describe('KPI Analytics — dashboard shell & sub-tabs', () => {
  test('loads the dashboard shell with header controls, filter panel and sub-tab switcher', async ({ page }) => {
    await gotoKpiAnalytics(page);

    // KPI sub-tab switcher (Radix tab triggers; "Dashboard" is the default).
    await expect(page.getByRole('tab', { name: 'Dashboard' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Plugins Configuration' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Holidays Calendar' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('data-state', 'active');

    // DashboardHeader: CardTitle is a plain div, so anchor on the unique
    // description text plus the stable header buttons/labels.
    await expect(page.getByText('Detailed performance metrics based on the master dataset')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recalculate' })).toBeVisible();
    // exact: "Filters" would otherwise also match "Clear All Filters" /
    // "Apply Filters" inside the open filter panel.
    await expect(page.getByRole('button', { name: 'Filters', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Print' })).toBeVisible();
    await expect(page.getByText('Analysis Period', { exact: true })).toBeVisible();
    await expect(page.getByText('Quick Presets', { exact: true })).toBeVisible();

    // Filters area: KpiFilterPanel defaults to open (filterPanelOpen: true).
    await expect(page.getByText('Advanced Filtering')).toBeVisible();
    await expect(page.getByText('JQL-Lite Filter', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Apply Filters' })).toBeVisible();

    // Empty state: no connection → kpiResults stay empty and KpiDashboard
    // renders the placeholder card. The calc-error banner (role="alert") must
    // not appear; scope by its text because Sonner's toaster also mounts an
    // (empty) alert landmark.
    await expect(page.getByText('No KPI results yet')).toBeVisible();
    await expect(page.getByText('KPI calculation failed')).toHaveCount(0);

    // VisualizationsSection is gated on kpiResults — not rendered in the true
    // empty state. Covered by the mocked add/remove visualization test below.
    await expect(page.getByRole('heading', { name: 'Visualizations' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add Visualization' })).toHaveCount(0);
  });

  test('emits no console errors or page errors across load, tab and sub-tab switches', async ({ page }) => {
    const guard = attachConsoleGuard(page);

    await gotoHome(page);
    await clickTab(page, 'KPI Analytics');
    await expect(page.getByText('No KPI results yet')).toBeVisible();

    // Exercise both directions of the sub-tab switcher — mount/unmount of
    // KpiDashboard and PluginsPanel is where key/QueryClient regressions bite.
    await page.getByRole('tab', { name: 'Plugins Configuration' }).click();
    await expect(page.getByText('KPI Plugin Registry')).toBeVisible();
    await page.getByRole('tab', { name: 'Dashboard' }).click();
    await expect(page.getByText('No KPI results yet')).toBeVisible();

    expectCleanConsole(guard, 'load + KPI tab + sub-tab switches');
  });

  test('switches to the Plugins Configuration sub-tab and back', async ({ page }) => {
    await gotoKpiAnalytics(page);

    await page.getByRole('tab', { name: 'Plugins Configuration' }).click();
    await expect(page.getByRole('tab', { name: 'Plugins Configuration' })).toHaveAttribute('data-state', 'active');

    // PluginsPanel configuration UI (stable card titles/descriptions).
    await expect(page.getByText('KPI Plugin Registry')).toBeVisible();
    await expect(page.getByText('Select which KPIs to calculate and display')).toBeVisible();
    await expect(page.getByText('Widget Display Order')).toBeVisible();

    // Back to the dashboard sub-tab.
    await page.getByRole('tab', { name: 'Dashboard' }).click();
    await expect(page.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('data-state', 'active');
    await expect(page.getByRole('button', { name: 'Recalculate' })).toBeVisible();
  });
});

test.describe('KPI Analytics — visualizations', () => {
  // The Visualizations section only renders once KPI results exist. Make that
  // happen hermetically: seed a connection into localStorage (no real Jira)
  // and intercept the app's own endpoints with canned payloads.
  const FAKE_KPI_RESULTS = [
    {
      pluginId: 'e2e_sample_kpi', // no trend/daily/weekly/monthly tokens → not time-series
      results: [{ name: 'E2E Sample Metric', value: 42, unit: '' }],
    },
  ];

  async function setupKpiDashboardWithData(page: Page) {
    // KPI calculation is disabled without an active connection id; seeding
    // localStorage enables the query. The id is random per run and never hits
    // a real Jira server.
    seedConnection(page, {
      name: 'E2E KPI Seed',
      baseUrl: 'https://e2e.invalid',
      email: 'e2e@example.com',
      apiToken: 'e2e-token',
    });

    // Pre-configure the active-plugin selection (what PluginsPanel persists).
    // Needed because mounting the KPI tab while kpiResults are still empty
    // makes usePersistedList write cfg_active_plugins=[]; once that key exists
    // KpiDashboard treats the selection as "configured but empty" and filters
    // out every result — even after the calculation lands. Seeding the fake
    // plugin id models a user who has configured plugins and keeps the
    // Visualizations section reachable. (Worth a src/ follow-up: the mount
    // write defeats the hasConfiguredActivePlugins "never configured" check.)
    page.addInitScript((pluginIds) => {
      localStorage.setItem('cfg_active_plugins', JSON.stringify(pluginIds));
    }, FAKE_KPI_RESULTS.map((r) => r.pluginId));

    // The seeded connection triggers a master-dataset restore on mount.
    // Serve the same payload the real route returns for a connection with no
    // extracted data, so the test never depends on the local SQLite contents.
    await page.route('**/api/jira/master/**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            totalExtracted: 0,
            issues: [],
            message: 'No master dataset found. Extract data to build the master dataset.',
          },
        }),
      })
    );

    // Feed the dashboard a minimal KPI result set.
    await page.route('**/api/kpi/calculate', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ success: true, results: FAKE_KPI_RESULTS }),
      })
    );

    await gotoKpiAnalytics(page);
    // Metrics Overview appears once kpiResults are populated (proves the
    // mocked calculation landed before we drive the Visualizations section).
    // Its h3 is nested in a collapse <button>, so match on text, not role.
    await expect(page.getByText('Metrics Overview', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Visualizations' })).toBeVisible();
  }

  test('adds and removes a chart card via the Visualizations section', async ({ page }) => {
    await setupKpiDashboardWithData(page);

    // The store default seeds one chart config (chart-1), so exactly one card
    // is present before we add anything.
    const initialCard = page.locator('#chart-card-chart-1');
    await expect(initialCard).toBeVisible();
    await expect(page.locator('[id^="chart-card-"]')).toHaveCount(1);

    // Add → a second card appears (new id is chart-<timestamp>).
    await page.getByRole('button', { name: 'Add Visualization' }).click();
    await expect(page.locator('[id^="chart-card-"]')).toHaveCount(2);
    const newCard = page.locator('[id^="chart-card-"]:not(#chart-card-chart-1)');
    await expect(newCard).toBeVisible();
    // A chart without a selected KPI renders the placeholder prompt.
    await expect(newCard.getByText('Select a KPI to visualize')).toBeVisible();

    // Remove via the card's accessible remove control (aria-label in
    // ChartCard). Only the added card's button is in scope.
    await newCard.getByRole('button', { name: 'Remove chart' }).click();
    await expect(page.locator('[id^="chart-card-"]')).toHaveCount(1);
    await expect(initialCard).toBeVisible();
  });

  test('emits no console errors while rendering seeded KPI results and charts', async ({ page }) => {
    const guard = attachConsoleGuard(page);
    await setupKpiDashboardWithData(page);

    // Drive one add/remove cycle — chart list mutations are where duplicate
    // React keys would surface.
    await page.getByRole('button', { name: 'Add Visualization' }).click();
    await expect(page.locator('[id^="chart-card-"]')).toHaveCount(2);
    const newCard = page.locator('[id^="chart-card-"]:not(#chart-card-chart-1)');
    await newCard.getByRole('button', { name: 'Remove chart' }).click();
    await expect(page.locator('[id^="chart-card-"]')).toHaveCount(1);

    expectCleanConsole(guard, 'seeded KPI results + add/remove chart');
  });
});
