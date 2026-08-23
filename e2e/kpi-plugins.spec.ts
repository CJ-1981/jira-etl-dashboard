import { test, expect } from '@playwright/test';

// The plugin registry endpoint (GET /api/kpi/plugins) returns the KPI plugins
// registered in the in-memory engine. Built-in and time-series plugins load
// synchronously at engine construction, so this is a hermetic full-stack target
// (no Jira connection or database needed) for asserting that the plugins added
// this release — including the daily/weekly/monthly interval variants — are
// actually registered and served over HTTP.

test.describe('KPI plugin registry API', () => {
  test('serves the new analytics plugins and interval variants', async ({ request }) => {
    const res = await request.get('/api/kpi/plugins');
    expect(res.ok()).toBeTruthy();

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(Array.isArray(body.plugins)).toBe(true);

    const plugins = body.plugins as Array<{ id: string; category: string }>;
    const ids = plugins.map((p) => p.id);

    // New built-in analytics plugins registered this release.
    expect(ids).toContain('backlog_age_percentiles');
    expect(ids).toContain('first_time_resolution_rate');

    // Interval variants produced by the time-series plugin factories.
    expect(ids).toContain('open_tickets_by_assignee_trend_daily');
    expect(ids).toContain('open_tickets_by_assignee_trend_monthly');
    expect(ids).toContain('time_in_status_trend_weekly');
    expect(ids).toContain('time_in_status_trend_monthly');

    // Guard against accidental double registration.
    expect(new Set(ids).size).toBe(ids.length);

    // 26 core + 13 time-series = 39 non-custom plugins (custom plugins load
    // asynchronously, so count only built-in/time-series categories).
    const nonCustom = plugins.filter((p) => p.category !== 'custom');
    expect(nonCustom.length).toBe(39);
  });
});
