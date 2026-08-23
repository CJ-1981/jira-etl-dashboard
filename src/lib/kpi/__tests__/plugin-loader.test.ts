import { describe, it, expect } from 'vitest';
import { PluginLoader } from '../plugin-loader';

/**
 * Guards against plugins being imported but never registered (a past bug left
 * two builtin plugins as dead imports, so they never surfaced in the UI).
 */
describe('PluginLoader registration', () => {
  const loader = new PluginLoader();

  it('registers builtin plugins with unique ids', () => {
    const ids = loader.loadBuiltinPlugins().map((p) => p.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it('registers the backlog age and first-time resolution plugins', () => {
    const ids = loader.loadBuiltinPlugins().map((p) => p.id);
    expect(ids).toContain('backlog_age_percentiles');
    expect(ids).toContain('first_time_resolution_rate');
  });

  it('registers time-series plugins with unique ids', () => {
    const ids = loader.loadTimeSeriesPlugins().map((p) => p.id);
    expect(ids).toHaveLength(new Set(ids).size);
  });

  it('registers the assignee and time-in-status interval variants', () => {
    const ids = loader.loadTimeSeriesPlugins().map((p) => p.id);
    // Weekly assignee keeps its historical id (no interval suffix).
    expect(ids).toContain('open_tickets_by_assignee_trend');
    expect(ids).toContain('open_tickets_by_assignee_trend_daily');
    expect(ids).toContain('open_tickets_by_assignee_trend_monthly');
    expect(ids).toContain('time_in_status_trend_daily');
    expect(ids).toContain('time_in_status_trend_weekly');
    expect(ids).toContain('time_in_status_trend_monthly');
  });

  it('keeps ids unique across builtin and time-series combined', () => {
    const ids = [
      ...loader.loadBuiltinPlugins().map((p) => p.id),
      ...loader.loadTimeSeriesPlugins().map((p) => p.id),
    ];
    expect(ids).toHaveLength(new Set(ids).size);
  });
});
