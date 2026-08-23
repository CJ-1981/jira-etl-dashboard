/**
 * Tests for chart-data-utils.ts — pure data-transformation helpers that turn
 * KpiResult payloads into Recharts-friendly datasets, plus color/scale/format
 * helpers. No React, no network; pure functions over sample KpiResult inputs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  CHART_COLORS,
  getUniqueColor,
  getUniqueDashArray,
  getColorForValue,
  transformForBarChart,
  transformForPieChart,
  transformForLineChart,
  isTimeSeriesPlugin,
  getKpiOptions,
  getRecommendedChartType,
  formatChartValue,
  type KpiResult,
} from '../chart-data-utils';
import { KEYS } from '../config/local-store';

// The chart-data-utils module keeps a 5s in-memory cache of the plugin
// registry read from localStorage. A `storage` event for the plugins key resets
// it, so dispatch one in beforeEach to keep tests deterministic.
function resetPluginCache() {
  window.dispatchEvent(new StorageEvent('storage', { key: KEYS.plugins }));
}

beforeEach(() => {
  localStorage.clear();
  resetPluginCache();
});

describe('CHART_COLORS', () => {
  it('exposes the documented palette length and first/last values', () => {
    // 17 named colors + 8 darker variants = 25 entries.
    expect(CHART_COLORS.length).toBe(25);
    expect(CHART_COLORS[0]).toBe('#10b981'); // emerald
    expect(CHART_COLORS[CHART_COLORS.length - 1]).toBe('#ea580c'); // darker orange
  });
});

describe('getUniqueColor', () => {
  it('returns palette colors for in-range indices', () => {
    expect(getUniqueColor(0)).toBe(CHART_COLORS[0]);
    expect(getUniqueColor(5)).toBe(CHART_COLORS[5]);
    expect(getUniqueColor(CHART_COLORS.length - 1)).toBe(
      CHART_COLORS[CHART_COLORS.length - 1],
    );
  });

  it('generates an HSL color once the palette is exhausted', () => {
    const color = getUniqueColor(CHART_COLORS.length);
    expect(color).toMatch(/^hsl\(/);
    // Golden-angle approximation: (24 * 137.508) % 360
    const expectedHue = (CHART_COLORS.length * 137.508) % 360;
    expect(color).toContain(`${expectedHue}`);
  });
});

describe('getUniqueDashArray', () => {
  it('returns undefined for the solid-line range (indices < length/2)', () => {
    // length 25 -> 25/2 = 12.5 -> indices 0..12 are solid
    const half = Math.floor(CHART_COLORS.length / 2);
    for (let i = 0; i <= half; i++) {
      expect(getUniqueDashArray(i)).toBeUndefined();
    }
  });

  it('returns dash patterns for indices past the solid-line range', () => {
    // floor(25/2)=12; result is patterns[(index - 12) % 8]
    expect(getUniqueDashArray(13)).toBe('8 4'); // patterns[1]
    expect(getUniqueDashArray(14)).toBe('4 2 2 2'); // patterns[2]
    expect(getUniqueDashArray(19)).toBe('6 2 2 2 2 2'); // patterns[7]
  });

  it('wraps around the 8-entry pattern list for very high indices', () => {
    // (20 - 12) = 8 -> patterns[0]
    expect(getUniqueDashArray(20)).toBe('4 4');
  });
});

describe('getColorForValue', () => {
  it('colors percentage values by health thresholds', () => {
    expect(getColorForValue(95, '%')).toBe('#10b981'); // emerald >= 80
    expect(getColorForValue(80, '%')).toBe('#10b981');
    expect(getColorForValue(60, '%')).toBe('#f59e0b'); // amber >= 50
    expect(getColorForValue(50, '%')).toBe('#f59e0b');
    expect(getColorForValue(40, '%')).toBe('#ef4444'); // red
  });

  it('colors hour values by lower-is-better thresholds', () => {
    expect(getColorForValue(20, 'hours')).toBe('#10b981'); // <= 40
    expect(getColorForValue(40, 'hours')).toBe('#10b981');
    expect(getColorForValue(60, 'hours')).toBe('#f59e0b'); // <= 80
    expect(getColorForValue(80, 'hours')).toBe('#f59e0b');
    expect(getColorForValue(120, 'hours')).toBe('#ef4444'); // > 80
  });

  it('falls back to blue for any other unit', () => {
    expect(getColorForValue(5, 'count')).toBe('#3b82f6');
    expect(getColorForValue(5, '')).toBe('#3b82f6');
  });
});

describe('transformForBarChart', () => {
  it('returns [] when the selected KPI is missing', () => {
    expect(transformForBarChart([], 'missing')).toEqual([]);
    expect(
      transformForBarChart(
        [{ pluginId: 'a', results: [{ name: 'x', value: 1, unit: 'count' }] }],
        'other',
      ),
    ).toEqual([]);
  });

  it('returns [] when the selected KPI has no results', () => {
    expect(
      transformForBarChart([{ pluginId: 'a', results: [] }], 'a'),
    ).toEqual([]);
  });

  it('maps a single value to one health-colored bar', () => {
    const kpi: KpiResult = {
      pluginId: 'open_tickets',
      results: [{ name: 'Total', value: 42.5, unit: 'count', ticketKeys: ['T1'] } as any],
    };
    const out = transformForBarChart([kpi], 'open_tickets');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('Total');
    expect(out[0].value).toBe(42.5);
    expect(out[0].fill).toBe('#3b82f6'); // getColorForValue falls back to blue
    expect(out[0].ticketKeys).toEqual(['T1']);
  });

  it('adds weekly breakdown from details on the single-value path', () => {
    const kpi: KpiResult = {
      pluginId: 'open_tickets',
      results: [
        {
          name: 'Total',
          value: 10,
          unit: 'count',
          details: [
            { label: 'This Week', value: 3 },
            { label: '1 week old', value: 2 },
            { label: '2+ weeks old', value: 5 },
          ],
        } as any,
      ],
    };
    const out = transformForBarChart([kpi], 'open_tickets');
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(10);
    expect(out[0].thisWeek).toBe(3);
    expect(out[0].prevWeek).toBe(2);
    expect(out[0].existing).toBe(5);
  });

  it('maps multiple distribution results to palette-colored bars', () => {
    const kpi: KpiResult = {
      pluginId: 'open_tickets_by_status',
      results: [
        { name: 'Open', value: 5.123, unit: 'count', dimensions: { status: 'Open' } },
        { name: 'In Progress', value: 3, unit: 'count', dimensions: { status: 'In Progress' } },
      ],
    };
    const out = transformForBarChart([kpi], 'open_tickets_by_status');
    expect(out).toHaveLength(2);
    // dimension values are joined with ' - '
    expect(out[0].name).toBe('Open');
    expect(out[0].value).toBe(5.12); // toFixed(2)
    expect(out[0].fill).toBe(CHART_COLORS[0]); // palette, not health
    expect(out[1].name).toBe('In Progress');
    expect(out[1].fill).toBe(CHART_COLORS[1]);
  });

  it('uses health colors for performance (sla/processing_time) metrics', () => {
    const kpi: KpiResult = {
      pluginId: 'sla_compliance',
      results: [
        { name: 'SLA', value: 90, unit: '%' },
        { name: 'SLA2', value: 40, unit: '%' },
      ],
    };
    const out = transformForBarChart([kpi], 'sla_compliance');
    expect(out[0].fill).toBe('#10b981'); // 90% -> emerald
    expect(out[1].fill).toBe('#ef4444'); // 40% -> red
    // No dimensions -> keeps the result name
    expect(out[0].name).toBe('SLA');
  });

  it('propagates isComplete and ticketKeys on the multi-result regular path', () => {
    // No age-breakdown markers (no ageCategory / suffix / age detail labels),
    // so this stays on the regular multi-result path where isComplete is copied.
    const kpi: KpiResult = {
      pluginId: 'open_tickets_by_status',
      results: [
        {
          name: 'Open',
          value: 10,
          unit: 'count',
          dimensions: { status: 'Open' },
          isComplete: true,
          ticketKeys: ['T1'],
        } as any,
        {
          name: 'Done',
          value: 5,
          unit: 'count',
          dimensions: { status: 'Done' },
        } as any,
      ],
    };
    const out = transformForBarChart([kpi], 'open_tickets_by_status');
    expect(out).toHaveLength(2);
    expect(out[0].isComplete).toBe(true);
    expect(out[0].ticketKeys).toEqual(['T1']);
    expect(out[0].fill).toBe(CHART_COLORS[0]);
    expect(out[1].isComplete).toBeUndefined();
  });

  it('groups age-breakdown results by base name (suffix pattern)', () => {
    const kpi: KpiResult = {
      pluginId: 'aging_report',
      results: [
        { name: 'P1 (This Week)', value: 2, unit: 'count', ticketKeys: ['T1'] as any },
        { name: 'P1 (Last Week)', value: 4, unit: 'count', ticketKeys: ['T2'] as any },
        { name: 'P1 (Existing)', value: 6, unit: 'count', ticketKeys: ['T3'] as any },
      ],
    };
    const out = transformForBarChart([kpi], 'aging_report');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('P1');
    expect(out[0].value).toBe(12);
    expect(out[0].thisWeek).toBe(2);
    expect(out[0].prevWeek).toBe(4);
    expect(out[0].existing).toBe(6);
    expect(out[0].fill).toBe(CHART_COLORS[0]);
    expect(out[0].ticketKeys).toEqual(['T1', 'T2', 'T3']);
  });

  it('keeps multiple age groups in insertion order with distinct colors', () => {
    const kpi: KpiResult = {
      pluginId: 'aging_report',
      results: [
        { name: 'P1 (This Week)', value: 2, unit: 'count' },
        { name: 'P1 (Existing)', value: 6, unit: 'count' },
        { name: 'P2 (This Week)', value: 1, unit: 'count' },
        { name: 'P2 (Existing)', value: 3, unit: 'count' },
      ],
    };
    const out = transformForBarChart([kpi], 'aging_report');
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe('P1');
    expect(out[0].value).toBe(8);
    expect(out[0].thisWeek).toBe(2);
    expect(out[0].existing).toBe(6);
    expect(out[0].fill).toBe(CHART_COLORS[0]);
    expect(out[1].name).toBe('P2');
    expect(out[1].value).toBe(4);
    expect(out[1].thisWeek).toBe(1);
    expect(out[1].existing).toBe(3);
    expect(out[1].fill).toBe(CHART_COLORS[1]);
  });

  it('categorizes age via dimensions.ageCategory', () => {
    const kpi: KpiResult = {
      pluginId: 'aging_report',
      results: [
        { name: 'P1', value: 2, unit: 'count', dimensions: { ageCategory: 'this_week' } },
        { name: 'P1', value: 3, unit: 'count', dimensions: { ageCategory: 'last_week' } },
        { name: 'P1', value: 4, unit: 'count', dimensions: { ageCategory: 'existing' } },
      ],
    };
    const out = transformForBarChart([kpi], 'aging_report');
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe('P1');
    expect(out[0].thisWeek).toBe(2);
    expect(out[0].prevWeek).toBe(3);
    expect(out[0].existing).toBe(4);
    expect(out[0].value).toBe(9);
  });

  it('categorizes age via details labels and falls back to existing for unknown', () => {
    const kpi: KpiResult = {
      pluginId: 'aging_report',
      results: [
        {
          name: 'P1',
          value: 2,
          unit: 'count',
          details: [{ label: 'This Week', value: 2 }],
        },
        {
          name: 'P1',
          value: 3,
          unit: 'count',
          details: [{ label: '1 week old', value: 3 }],
        },
        {
          name: 'P1',
          value: 5,
          unit: 'count',
          details: [{ label: '2+ weeks old', value: 5 }],
        },
        {
          // No recognizable age marker -> fallback bucket (existing)
          name: 'P1',
          value: 1,
          unit: 'count',
          details: [{ label: 'Something else', value: 1 }],
        },
      ],
    };
    const out = transformForBarChart([kpi], 'aging_report');
    expect(out).toHaveLength(1);
    expect(out[0].thisWeek).toBe(2);
    expect(out[0].prevWeek).toBe(3);
    // existing = 5 (labeled) + 1 (fallback)
    expect(out[0].existing).toBe(6);
    expect(out[0].value).toBe(11);
  });

  it('uses result.name when a result has no dimensions in the regular path', () => {
    const kpi: KpiResult = {
      pluginId: 'assignees',
      results: [
        { name: 'Alice', value: 4, unit: 'count' },
        { name: 'Bob', value: 2, unit: 'count' },
      ],
    };
    const out = transformForBarChart([kpi], 'assignees');
    expect(out.map((d) => d.name)).toEqual(['Alice', 'Bob']);
  });
});

describe('transformForPieChart', () => {
  it('returns [] for missing KPI or empty results', () => {
    expect(transformForPieChart([], 'x')).toEqual([]);
    expect(
      transformForPieChart([{ pluginId: 'a', results: [] }], 'a'),
    ).toEqual([]);
  });

  it('maps results to palette-colored pie slices with unit', () => {
    const kpi: KpiResult = {
      pluginId: 'by_priority',
      results: [
        { name: 'High', value: 5, unit: 'count', dimensions: { priority: 'High' } },
        { name: 'Low', value: 3, unit: 'count', dimensions: { priority: 'Low' } },
      ],
    };
    const out = transformForPieChart([kpi], 'by_priority');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      name: 'High',
      value: 5,
      fill: CHART_COLORS[0],
      unit: 'count',
    });
    expect(out[1].fill).toBe(CHART_COLORS[1]);
    expect(out[0].ticketKeys).toEqual([]);
  });

  it('uses result name when there are no dimensions', () => {
    const kpi: KpiResult = {
      pluginId: 'by_priority',
      results: [{ name: 'Total', value: 9, unit: 'count', ticketKeys: ['T9'] as any }],
    };
    const out = transformForPieChart([kpi], 'by_priority');
    expect(out[0].name).toBe('Total');
    expect(out[0].ticketKeys).toEqual(['T9']);
  });
});

describe('transformForLineChart', () => {
  it('returns [] for missing KPI or empty results', () => {
    expect(transformForLineChart([], 'x')).toEqual([]);
    expect(
      transformForLineChart([{ pluginId: 'a', results: [] }], 'a'),
    ).toEqual([]);
  });

  it('sorts time-series points by date and maps value/isComplete', () => {
    const kpi: KpiResult = {
      pluginId: 'throughput_trend',
      results: [
        {
          name: 'Throughput',
          value: 0,
          unit: 'count',
          timeSeries: [
            { period: '2026-W2', date: new Date('2026-01-12'), value: 5, count: 5, isComplete: true },
            { period: '2026-W1', date: new Date('2026-01-05'), value: 3, count: 3, isComplete: false },
          ],
        },
      ],
    };
    const out = transformForLineChart([kpi], 'throughput_trend');
    expect(out.map((d) => d.name)).toEqual(['2026-W1', '2026-W2']);
    expect(out[0].value).toBe(3);
    expect(out[0].isComplete).toBe(false);
    expect(out[1].value).toBe(5);
    expect(out[1].isComplete).toBe(true);
    expect(out[1].date).toBeInstanceOf(Date);
  });

  it('sorts time-series points whose dates are ISO strings (API round-trip)', () => {
    // KPI results travel through a JSON API boundary: Date objects serialize
    // to ISO strings, so consumers must sort correctly when `date` is a string.
    const kpi: KpiResult = {
      pluginId: 'throughput_trend',
      results: [
        {
          name: 'Throughput',
          value: 0,
          unit: 'count',
          timeSeries: [
            { period: '2026-W3', date: '2026-01-18T23:59:59.999Z', value: 7, count: 7, isComplete: true },
            { period: '2026-W1', date: '2026-01-04T23:59:59.999Z', value: 2, count: 2, isComplete: true },
            { period: '2026-W2', date: '2026-01-11T23:59:59.999Z', value: 4, count: 4, isComplete: false },
          ],
        },
      ],
    };
    const out = transformForLineChart([kpi], 'throughput_trend');
    expect(out.map((d) => d.name)).toEqual(['2026-W1', '2026-W2', '2026-W3']);
    expect(out.map((d) => d.value)).toEqual([2, 4, 7]);
    expect(out[0].isComplete).toBe(true);
    expect(out[1].isComplete).toBe(false);
    // The original string value is passed through untouched
    expect(out[0].date).toBe('2026-01-04T23:59:59.999Z');
  });

  it('sorts a mix of Date and string dates correctly', () => {
    const kpi: KpiResult = {
      pluginId: 'throughput_trend',
      results: [
        {
          name: 'Throughput',
          value: 0,
          unit: 'count',
          timeSeries: [
            { period: '2026-W2', date: '2026-01-11T23:59:59.999Z', value: 4, count: 4 },
            { period: '2026-W1', date: new Date('2026-01-04T23:59:59.999Z'), value: 2, count: 2 },
          ],
        },
      ],
    };
    const out = transformForLineChart([kpi], 'throughput_trend');
    expect(out.map((d) => d.name)).toEqual(['2026-W1', '2026-W2']);
  });

  it('falls back to period localeCompare when dates are missing', () => {
    const kpi: KpiResult = {
      pluginId: 'throughput_trend',
      results: [
        {
          name: 'Throughput',
          value: 0,
          unit: 'count',
          timeSeries: [
            { period: 'B-week', date: undefined as any, value: 2, count: 2 },
            { period: 'A-week', date: undefined as any, value: 1, count: 1 },
          ],
        },
      ],
    };
    const out = transformForLineChart([kpi], 'throughput_trend');
    expect(out.map((d) => d.name)).toEqual(['A-week', 'B-week']);
  });

  it('falls back to dimension-based points when no time series', () => {
    const kpi: KpiResult = {
      pluginId: 'by_status',
      results: [
        { name: 'Open', value: 5, unit: 'count', dimensions: { status: 'Open' }, ticketKeys: ['T1'] as any },
        { name: 'Done', value: 9, unit: 'count', dimensions: { status: 'Done' } },
      ],
    };
    const out = transformForLineChart([kpi], 'by_status');
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Open', value: 5, ticketKeys: ['T1'] });
    expect(out[1].name).toBe('Done');
  });

  it('emits a single trend point for a single value with no dimensions', () => {
    const kpi: KpiResult = {
      pluginId: 'total',
      results: [{ name: 'Total', value: 42, unit: 'count', ticketKeys: ['T1'] as any }],
    };
    const out = transformForLineChart([kpi], 'total');
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Total', value: 42, ticketKeys: ['T1'] });
  });

  it('treats missing result.value as 0 on the fallback paths', () => {
    const kpi: KpiResult = {
      pluginId: 'total',
      results: [{ name: 'Total', value: undefined as any, unit: 'count' }],
    };
    const out = transformForLineChart([kpi], 'total');
    expect(out[0].value).toBe(0);
  });
});

describe('isTimeSeriesPlugin', () => {
  it('detects _trend / trend in the id', () => {
    expect(isTimeSeriesPlugin('throughput_trend')).toBe(true);
    expect(isTimeSeriesPlugin('something_trendy')).toBe(true); // 'trend' substring
  });

  it('detects _weekly / _monthly / _daily', () => {
    expect(isTimeSeriesPlugin('foo_weekly')).toBe(true);
    expect(isTimeSeriesPlugin('foo_monthly')).toBe(true);
    expect(isTimeSeriesPlugin('foo_daily')).toBe(true);
  });

  it('strips a plugin- prefix before checking', () => {
    expect(isTimeSeriesPlugin('plugin-throughput_trend')).toBe(true);
  });

  it('returns true for the curated time-series plugin ids', () => {
    expect(isTimeSeriesPlugin('open_tickets_by_assignee_trend')).toBe(true);
    expect(isTimeSeriesPlugin('open_tickets_by_priority_trend')).toBe(true);
    expect(isTimeSeriesPlugin('open_tickets_by_status_trend')).toBe(true);
    expect(isTimeSeriesPlugin('throughput_trend')).toBe(true);
    expect(isTimeSeriesPlugin('cumulative_flow')).toBe(true);
  });

  it('returns false for a plain distribution plugin', () => {
    expect(isTimeSeriesPlugin('open_tickets_by_status')).toBe(false);
  });

  it('detects time-series category from the plugin registry', () => {
    resetPluginCache();
    localStorage.setItem(
      KEYS.plugins,
      JSON.stringify([{ id: 'special_plugin', category: 'time-series' }]),
    );
    expect(isTimeSeriesPlugin('special_plugin')).toBe(true);
  });

  it('detects timeInterval / line / area visualization from the registry', () => {
    resetPluginCache();
    localStorage.setItem(
      KEYS.plugins,
      JSON.stringify([{ id: 'special_plugin', timeInterval: 'weekly' }]),
    );
    expect(isTimeSeriesPlugin('special_plugin')).toBe(true);

    resetPluginCache();
    localStorage.setItem(
      KEYS.plugins,
      JSON.stringify([{ id: 'special_plugin', visualization: 'line' }]),
    );
    expect(isTimeSeriesPlugin('special_plugin')).toBe(true);

    resetPluginCache();
    localStorage.setItem(
      KEYS.plugins,
      JSON.stringify([{ id: 'special_plugin', visualization: 'area' }]),
    );
    expect(isTimeSeriesPlugin('special_plugin')).toBe(true);
  });

  it('returns false when the registry plugin is not time-series', () => {
    resetPluginCache();
    localStorage.setItem(
      KEYS.plugins,
      JSON.stringify([{ id: 'special_plugin', category: 'distribution' }]),
    );
    expect(isTimeSeriesPlugin('special_plugin')).toBe(false);
  });

  it('returns false when the plugin is absent from the registry', () => {
    resetPluginCache();
    localStorage.setItem(KEYS.plugins, JSON.stringify([{ id: 'other_plugin' }]));
    expect(isTimeSeriesPlugin('special_plugin')).toBe(false);
  });

  it('survives invalid JSON in the registry (returns false)', () => {
    resetPluginCache();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    localStorage.setItem(KEYS.plugins, '{not valid json');
    expect(isTimeSeriesPlugin('special_plugin')).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('survives a non-array registry (catches the .find error)', () => {
    resetPluginCache();
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A JSON object has no .find(), so the lookup throws and is caught.
    localStorage.setItem(KEYS.plugins, JSON.stringify({ not: 'an array' }));
    expect(isTimeSeriesPlugin('special_plugin')).toBe(false);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('caches the registry read so removal from storage is ignored within TTL', () => {
    resetPluginCache();
    localStorage.setItem(
      KEYS.plugins,
      JSON.stringify([{ id: 'cached_plugin', category: 'time-series' }]),
    );
    expect(isTimeSeriesPlugin('cached_plugin')).toBe(true);
    // Removing from storage does NOT invalidate the in-memory cache.
    localStorage.removeItem(KEYS.plugins);
    expect(isTimeSeriesPlugin('cached_plugin')).toBe(true);
  });
});

describe('getKpiOptions', () => {
  it('returns empty groups for no results', () => {
    expect(getKpiOptions([])).toEqual({ timeSeries: [], regular: [] });
  });

  it('groups, formats, sorts, and tags time-series plugins', () => {
    const kpis: KpiResult[] = [
      { pluginId: 'open_tickets_by_status', results: [{ name: 'x', value: 1, unit: 'count' }] },
      { pluginId: 'throughput_trend', results: [{ name: 'x', value: 1, unit: 'count' }] },
      { pluginId: 'aging_report', results: [{ name: 'x', value: 1, unit: 'count' }] },
      { pluginId: 'cumulative_flow', results: [{ name: 'x', value: 1, unit: 'count' }] },
    ];
    const { timeSeries, regular } = getKpiOptions(kpis);
    // Time-series: throughput_trend + cumulative_flow, sorted by label.
    expect(timeSeries).toEqual([
      { id: 'cumulative_flow', label: '📈 Cumulative Flow' },
      { id: 'throughput_trend', label: '📈 Throughput Trend' },
    ]);
    // Regular: aging_report + open_tickets_by_status, sorted alphabetically.
    expect(regular).toEqual([
      { id: 'aging_report', label: 'Aging Report' },
      { id: 'open_tickets_by_status', label: 'Open Tickets By Status' },
    ]);
  });
});

describe('getRecommendedChartType', () => {
  it("returns 'bar' when the KPI is missing", () => {
    expect(getRecommendedChartType([], 'missing')).toBe('bar');
  });

  it("returns 'area' for cumulative_flow", () => {
    const kpi: KpiResult = {
      pluginId: 'cumulative_flow',
      results: [{ name: 'CFD', value: 1, unit: 'count' }],
    };
    expect(getRecommendedChartType([kpi], 'cumulative_flow')).toBe('area');
  });

  it("returns 'line' when the first result has a time series", () => {
    const kpi: KpiResult = {
      pluginId: 'throughput_trend',
      results: [
        {
          name: 'T',
          value: 1,
          unit: 'count',
          timeSeries: [{ period: 'p', date: new Date(), value: 1, count: 1 }],
        },
      ],
    };
    expect(getRecommendedChartType([kpi], 'throughput_trend')).toBe('line');
  });

  it("returns 'bar' for histogram/aging plugins", () => {
    const hist: KpiResult = {
      pluginId: 'cycle_time_histogram',
      results: [{ name: 'x', value: 1, unit: 'count' }],
    };
    expect(getRecommendedChartType([hist], 'cycle_time_histogram')).toBe('bar');

    const aging: KpiResult = {
      pluginId: 'ticket_aging',
      results: [{ name: 'x', value: 1, unit: 'count' }],
    };
    expect(getRecommendedChartType([aging], 'ticket_aging')).toBe('bar');
  });

  it("returns 'pie' for percentage-valued single results", () => {
    const kpi: KpiResult = {
      pluginId: 'sla_compliance',
      results: [{ name: 'SLA', value: 90, unit: '%' }],
    };
    expect(getRecommendedChartType([kpi], 'sla_compliance')).toBe('pie');
  });

  it("returns 'bar' when a status dimension is present", () => {
    const kpi: KpiResult = {
      pluginId: 'by_status',
      results: [{ name: 'Open', value: 5, unit: 'count', dimensions: { status: 'Open' } }],
    };
    expect(getRecommendedChartType([kpi], 'by_status')).toBe('bar');
  });

  it("returns 'bar' for a single value without dimensions", () => {
    const kpi: KpiResult = {
      pluginId: 'total',
      results: [{ name: 'Total', value: 42, unit: 'count' }],
    };
    expect(getRecommendedChartType([kpi], 'total')).toBe('bar');
  });
});

describe('formatChartValue', () => {
  it('formats percentages', () => {
    expect(formatChartValue(85.25, '%')).toBe('85.3%');
  });

  it('formats hours', () => {
    expect(formatChartValue(40.25, 'hours')).toBe('40.3h');
  });

  it('formats millions', () => {
    expect(formatChartValue(1_500_000)).toBe('1.5M');
  });

  it('formats thousands', () => {
    expect(formatChartValue(2_500)).toBe('2.5K');
  });

  it('formats plain numbers', () => {
    expect(formatChartValue(42)).toBe('42.0');
    expect(formatChartValue(42, 'ms')).toBe('42.0ms');
    expect(formatChartValue(42, undefined)).toBe('42.0');
  });
});
