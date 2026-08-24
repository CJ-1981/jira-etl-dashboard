/**
 * Chart Data Transformation Utilities
 *
 * Transforms KPI results into chart-friendly data formats for Recharts
 */

import { KEYS } from './config/local-store';

export interface KpiResult {
  pluginId: string;
  results: Array<{
    name: string;
    value: number;
    unit: string;
    dimensions?: {
      status?: string;
      priority?: string;
      [key: string]: any;
    };
    details?: Array<{ label: string; value: number; unit?: string }>;
    ticketKeys?: string[];
    /** Present on results that represent a completed period */
    isComplete?: boolean;
    timeSeries?: Array<{
      period: string;
      /**
       * @MX:WARN: `Date | string` — KPI results cross a JSON API boundary,
       * after which Date values arrive as ISO-8601 strings. Always normalize
       * with `new Date(date)` before doing date arithmetic.
       */
      date: Date | string;
      value: number;
      count: number;
      isComplete?: boolean;
      /** Ticket keys contributing to this time-series point */
      ticketKeys?: string[];
    }>;
  }>;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  fill?: string;
  /** @MX:WARN: May be an ISO string after a JSON API round-trip; normalize with `new Date()` before arithmetic. */
  date?: Date | string;
  thisWeek?: number;  // This week's value
  prevWeek?: number;  // Last week's value (1 week old)
  existing?: number; // Existing tickets (2+ weeks old)
  [key: string]: any;
}

// Color scheme matching existing UI
const COLORS = {
  emerald: '#10b981',
  blue: '#3b82f6',
  amber: '#f59e0b',
  red: '#ef4444',
  purple: '#8b5cf6',
  cyan: '#06b6d4',
  pink: '#ec4899',
  orange: '#f97316',
  indigo: '#6366f1',
  teal: '#14b8a6',
  rose: '#f43f5e',
  lime: '#84cc16',
  sky: '#0ea5e9',
  violet: '#8b5cf6',
  fuchsia: '#d946ef',
  yellow: '#eab308',
  slate: '#64748b',
  zinc: '#71717a',
  neutral: '#737373',
  stone: '#78716c',
};

// Expanded color palette for better distinction with many data sources
export const CHART_COLORS = [
  COLORS.emerald,
  COLORS.blue,
  COLORS.amber,
  COLORS.purple,
  COLORS.cyan,
  COLORS.pink,
  COLORS.orange,
  COLORS.red,
  COLORS.indigo,
  COLORS.teal,
  COLORS.rose,
  COLORS.lime,
  COLORS.sky,
  COLORS.violet,
  COLORS.fuchsia,
  COLORS.yellow,
  COLORS.slate,
  // Add lighter/darker variants for even more distinction
  '#059669', // darker emerald
  '#2563eb', // darker blue
  '#d97706', // darker amber
  '#dc2626', // darker red
  '#7c3aed', // darker purple
  '#0891b2', // darker cyan
  '#db2777', // darker pink
  '#ea580c', // darker orange
];

/**
 * Get a unique color for a given index
 * Uses the expanded palette first, then generates colors using HSL for uniqueness
 */
export function getUniqueColor(index: number): string {
  if (index < CHART_COLORS.length) {
    return CHART_COLORS[index];
  }

  // Generate a unique color using HSL color space
  // We vary hue around the color wheel while keeping saturation and lightness constant
  // for good perceptual distinction
  const baseHue = (index * 137.508) % 360; // Golden angle approximation for even distribution
  const saturation = 70; // Moderate saturation for visibility
  const lightness = 55; // Medium lightness for good contrast

  return `hsl(${baseHue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get a unique dash array for line charts
 * Returns different dash patterns to help distinguish series beyond just color
 */
export function getUniqueDashArray(index: number): string | undefined {
  // First few series have solid lines (no dash)
  if (index < CHART_COLORS.length / 2) {
    return undefined;
  }

  // Generate dash patterns based on index
  const patterns: string[] = [
    '4 4',      // dash
    '8 4',      // longer dash
    '4 2 2 2',  // dot-dash
    '8 2 2 2',  // long dash-dot
    '4 4 2 4',  // dash-dot-dash
    '12 4',     // very long dash
    '2 2',      // dots
    '6 2 2 2 2 2', // dash-dot-dot
  ];

  return patterns[(index - Math.floor(CHART_COLORS.length / 2)) % patterns.length];
}

/**
 * Get color based on value (for performance indicators)
 */
export function getColorForValue(value: number, unit: string): string {
  if (unit === '%') {
    if (value >= 80) return COLORS.emerald;
    if (value >= 50) return COLORS.amber;
    return COLORS.red;
  }
  if (unit === 'hours') {
    if (value <= 40) return COLORS.emerald;
    if (value <= 80) return COLORS.amber;
    return COLORS.red;
  }
  return COLORS.blue;
}

/**
 * Detail-row labels that signal a weekly age breakdown. Two label formats exist:
 * the legacy 'This Week'/'Previous Week' and the newer 'This Week'/'1 week old'/
 * '2+ weeks old'. Both are recognized everywhere a weekly breakdown is detected
 * or parsed.
 */
export const WEEKLY_BREAKDOWN_LABELS = ['This Week', 'Previous Week', '1 week old', '2+ weeks old'];

/**
 * Extract the weekly age breakdown (thisWeek / prevWeek / existing) from a
 * result's `details` rows, supporting both the legacy and the newer label
 * formats (see WEEKLY_BREAKDOWN_LABELS).
 * @MX:ANCHOR: Weekly age-breakdown detail parsing
 * @MX:REASON: This dual-format parsing was duplicated verbatim across the bar
 * chart paths; a single helper keeps the label handling consistent.
 */
export function extractWeeklyBreakdown(
  details: Array<{ label: string; value: number; unit?: string }> | undefined,
): { thisWeek?: number; prevWeek?: number; existing?: number } {
  if (!details) return {};
  const tw = details.find((d) => d.label === 'This Week');
  const lw = details.find((d) => d.label === '1 week old' || d.label === 'Previous Week');
  const existing = details.find((d) => d.label === '2+ weeks old');
  const out: { thisWeek?: number; prevWeek?: number; existing?: number } = {};
  if (tw) out.thisWeek = Number(tw.value.toFixed(2));
  if (lw) out.prevWeek = Number(lw.value.toFixed(2));
  if (existing) out.existing = Number(existing.value.toFixed(2));
  return out;
}

/**
 * A single row of a merged multi-series time-series dataset.
 *
 * `series<N>` holds the value of result N for this period and
 * `ticketKeys<N>` the drill-down keys of that point (see mergeTimeSeries).
 */
export interface MergedTimeSeriesPoint {
  /** Period label (x-axis category) */
  name: string;
  /**
   * false when at least one series reported an incomplete point for this
   * period. Only present when `trackCompleteness` is enabled.
   */
  isComplete?: boolean;
  /** series<N> / ticketKeys<N> fields keyed by result index */
  [key: string]: unknown;
}

/**
 * Minimal per-result shape consumed by {@link mergeTimeSeries} and
 * {@link hasMultipleTimeSeries}. Both the lib `KpiResult` rows and the
 * dashboard's `KpiCalcResult` rows satisfy it, so the helpers work on either.
 */
export interface TimeSeriesSource {
  timeSeries?: Array<{
    period: string;
    value: number;
    isComplete?: boolean;
    /** Ticket keys contributing to this time-series point */
    ticketKeys?: string[];
  }>;
}

/**
 * Merge the time series of multiple KPI results into one row per period.
 *
 * Collects every distinct period across all results, sorts them
 * lexicographically and emits one row per period with a `series<idx>` value
 * and `ticketKeys<idx>` array per result (idx = position in `results`).
 * Missing points default to 0 / [].
 *
 * @param trackCompleteness when true (default) each row carries `isComplete`,
 *   which becomes false if any series flagged the period as incomplete. Pass
 *   false to omit the field (e.g. stacked area charts ignore completeness).
 */
export function mergeTimeSeries(
  results: TimeSeriesSource[],
  options: { trackCompleteness?: boolean } = {},
): MergedTimeSeriesPoint[] {
  const trackCompleteness = options.trackCompleteness !== false;

  const allPeriods = new Set<string>();
  results.forEach((result) => {
    result.timeSeries?.forEach((point) => allPeriods.add(point.period));
  });

  const sortedPeriods = Array.from(allPeriods).sort();
  return sortedPeriods.map((period) => {
    const dataPoint: MergedTimeSeriesPoint = { name: period };
    let isComplete = true;
    results.forEach((result, idx) => {
      const point = result.timeSeries?.find((p) => p.period === period);
      dataPoint[`series${idx}`] = point?.value || 0;
      dataPoint[`ticketKeys${idx}`] = point?.ticketKeys || [];
      if (point && point.isComplete === false) isComplete = false;
    });
    if (trackCompleteness) {
      dataPoint.isComplete = isComplete;
    }
    return dataPoint;
  });
}

/**
 * True when a KPI has multiple results that all carry non-empty time series —
 * the condition under which charts render one series per result instead of a
 * single aggregated line/area/bar set.
 */
export function hasMultipleTimeSeries(
  results: TimeSeriesSource[] | undefined,
): boolean {
  return (
    !!results &&
    results.length > 1 &&
    results.every((r) => r.timeSeries && r.timeSeries.length > 0)
  );
}

/**
 * Transform KPI results for bar chart
 */
export function transformForBarChart(
  kpiResults: KpiResult[],
  selectedKpiId: string
): ChartDataPoint[] {
  const kpi = kpiResults.find((k) => k.pluginId === selectedKpiId);
  if (!kpi || kpi.results.length === 0) return [];

  // Determine if we should use a color palette or health-based colors
  // SLA and Processing Time usually benefit from health-based colors (red/amber/emerald)
  const isPerformanceMetric = kpi.pluginId.includes('sla') || kpi.pluginId.includes('processing_time');

  // If we have multiple results, it's likely a breakdown (by status, priority, assignee, etc.)
  if (kpi.results.length > 1 || kpi.results[0]?.dimensions) {
    // @MX:NOTE: Preserve plugin's sorting order (by ticket count or priority)
    // @MX:REASON: Plugins already sort results correctly; don't override with alphabetical sorting
    const sortedResults = kpi.results;

    // Check if results contain age breakdown data (by checking for ageCategory dimensions or age-related naming patterns)
    const hasAgeBreakdown = kpi.results.some(r =>
      r.dimensions?.ageCategory ||
      r.name.includes('(Existing)') ||
      r.name.includes('(Last Week)') ||
      r.name.includes('(This Week)') ||
      r.details?.some(d => WEEKLY_BREAKDOWN_LABELS.includes(d.label))
    );

    if (hasAgeBreakdown) {
      // Group results by base name (removing age category suffix)
      const grouped = new Map<string, {
        baseName: string;
        thisWeek: number;
        prevWeek: number;
        existing: number;
        ticketKeys: string[];
        fill: string;
      }>();

      for (const result of sortedResults) {
        // Extract base name by removing age category suffix
        let baseName = result.name
          .replace(/\s*\(Existing\)$/, '')
          .replace(/\s*\(Last Week\)$/, '')
          .replace(/\s*\(This Week\)$/, '');

        if (!grouped.has(baseName)) {
          grouped.set(baseName, {
            baseName,
            thisWeek: 0,
            prevWeek: 0,
            existing: 0,
            ticketKeys: [],
            fill: getUniqueColor(grouped.size)
          });
        }

        const group = grouped.get(baseName)!;

        // Categorize by age based on naming pattern or dimensions
        // Check both naming pattern and dimensions.ageCategory
        const isExisting = result.name.includes('(Existing)') ||
                          result.name.toLowerCase().includes('existing') ||
                          result.dimensions?.ageCategory === 'existing' ||
                          result.details?.some((d) => d.label === '2+ weeks old');
        const isLastWeek = result.name.includes('(Last Week)') ||
                           result.name.toLowerCase().includes('last week') ||
                           result.dimensions?.ageCategory === 'last_week' ||
                           result.details?.some((d) => d.label === '1 week old' || d.label === 'Previous Week');
        const isThisWeek = result.name.includes('(This Week)') ||
                           result.name.toLowerCase().includes('this week') ||
                           result.dimensions?.ageCategory === 'this_week' ||
                           result.details?.some((d) => d.label === 'This Week');

        if (isExisting) {
          group.existing += result.value;
          group.ticketKeys.push(...(result.ticketKeys || []));
        } else if (isLastWeek) {
          group.prevWeek += result.value;
          group.ticketKeys.push(...(result.ticketKeys || []));
        } else if (isThisWeek) {
          group.thisWeek += result.value;
          group.ticketKeys.push(...(result.ticketKeys || []));
        } else {
          // Fallback: use as total value (shouldn't happen for age breakdown plugins)
          group.existing += result.value;
          group.ticketKeys.push(...(result.ticketKeys || []));
        }
      }

      // Convert grouped data to chart format with age breakdown
      // @MX:NOTE: Preserve plugin's custom sorting order (e.g., priority P0->P3 or kanban order)
      // @MX:REASON: Map maintains the baseName insertion order from the already-sorted plugin results
      const groupedArray = Array.from(grouped.values()).map((group) => ({
        name: group.baseName,
        value: group.thisWeek + group.prevWeek + group.existing,
        fill: group.fill,
        ticketKeys: group.ticketKeys,
        thisWeek: group.thisWeek || 0,
        prevWeek: group.prevWeek || 0,
        existing: group.existing || 0,
      }));

      return groupedArray;
    }

    // Regular processing for non-age-breakdown results
    return sortedResults.map((result, index) => {
      // Combine all dimension values for a unique name (e.g. "Done - P1")
      const dimensionValues = Object.values(result.dimensions || {});
      const dimensionName = dimensionValues.length > 0
        ? dimensionValues.join(' - ')
        : result.name;

      // Use color palette for distribution metrics (assignees, status counts),
      // but stick to health colors for performance metrics (SLA, speed)
      const color = isPerformanceMetric
        ? getColorForValue(result.value, result.unit)
        : getUniqueColor(index);

      const dataPoint: ChartDataPoint = {
        name: dimensionName,
        value: Number(result.value.toFixed(2)),
        fill: color,
        ticketKeys: result.ticketKeys || [],
      };

      // Add isComplete if it's a timeSeries point (unlikely for distribution but good for consistency)
      if (result.isComplete !== undefined) dataPoint.isComplete = result.isComplete;

      // Add weekly breakdown if available in details (handles both the old
      // 'This Week/Previous Week' and new '1 week old/2+ weeks old' labels)
      Object.assign(dataPoint, extractWeeklyBreakdown(result.details));

      return dataPoint;
    });
  }

  // Single value - show as one bar
  const result = kpi.results[0];
  const dataPoint: ChartDataPoint = {
    name: result.name,
    value: Number(result.value.toFixed(2)),
    fill: getColorForValue(result.value, result.unit),
    ticketKeys: result.ticketKeys || [],
  };

  // Weekly breakdown (handles both the old 'This Week/Previous Week' and new
  // '1 week old/2+ weeks old' labels)
  Object.assign(dataPoint, extractWeeklyBreakdown(result.details));

  return [dataPoint];
}

/**
 * Transform KPI results for pie chart
 */
export function transformForPieChart(
  kpiResults: KpiResult[],
  selectedKpiId: string
): ChartDataPoint[] {
  const kpi = kpiResults.find((k) => k.pluginId === selectedKpiId);
  if (!kpi || kpi.results.length === 0) return [];

  // @MX:NOTE: Preserve plugin's sorting order
  // @MX:REASON: Plugins already sort results correctly; don't override
  const sortedResults = kpi.results;

  return sortedResults.map((result, index) => {
    const dimensionValues = Object.values(result.dimensions || {});
    const dimensionName = dimensionValues.length > 0 
      ? dimensionValues.join(' - ') 
      : result.name;
      
    return {
      name: dimensionName,
      value: Number(result.value.toFixed(2)),
      fill: getUniqueColor(index),
      unit: result.unit, // Pass unit for better formatting in Pie labels
      ticketKeys: result.ticketKeys || [],
    };
  });
}

/**
 * Transform KPI results for line chart
 *
 * Handles time-series data when available, otherwise falls back to dimension-based data
 */
export function transformForLineChart(
  kpiResults: KpiResult[],
  selectedKpiId: string
): ChartDataPoint[] {
  const kpi = kpiResults.find((k) => k.pluginId === selectedKpiId);
  if (!kpi || kpi.results.length === 0) return [];

  // Check if time-series data is available (prefer the first series if we're asked for a single-line data format)
  if (kpi.results[0]?.timeSeries && kpi.results[0].timeSeries.length > 0) {
    const sortedTimeSeries = [...kpi.results[0].timeSeries].sort((a, b) => {
      // @MX:WARN: `date` may be an ISO string after the JSON API round-trip —
      // `new Date(...)` normalizes both Date and string values.
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      if (aTime && bTime) return aTime - bTime;
      return a.period.localeCompare(b.period);
    });

    return sortedTimeSeries.map((point) => ({
      name: point.period,
      value: Number(point.value.toFixed(2)),
      date: point.date,
      isComplete: point.isComplete,
      ticketKeys: point.ticketKeys || [],
    }));
  }

  // Fallback: treat dimensions as x-axis categories
  if (kpi.results.length > 1 || kpi.results[0]?.dimensions) {
    // @MX:NOTE: Preserve plugin's sorting order
    // @MX:REASON: Plugins already sort results correctly; don't override
    const sortedResults = kpi.results;

    return sortedResults.map((result) => {
      const dimensionValues = Object.values(result.dimensions || {});
      const dimensionName = dimensionValues.length > 0 
        ? dimensionValues.join(' - ') 
        : result.name;
        
      return {
        name: dimensionName,
        value: Number((result.value || 0).toFixed(2)),
        ticketKeys: result.ticketKeys || [],
      };
    });
  }

  // Single value - create a simple trend point
  const result = kpi.results[0];
  return [
    {
      name: result.name,
      value: Number((result.value || 0).toFixed(2)),
      ticketKeys: result.ticketKeys || [],
    },
  ];
}

// Timed cache for plugin lookups to avoid synchronous localStorage performance penalties during re-renders
let cachedPlugins: any[] | null = null;
let lastCacheTime = 0;
const CACHE_DURATION_MS = 5000; // Cache for 5 seconds

function getCachedPlugins(): any[] {
  if (typeof window === 'undefined') return [];
  const now = Date.now();
  if (cachedPlugins && (now - lastCacheTime < CACHE_DURATION_MS)) {
    return cachedPlugins;
  }
  try {
    const localPlugins = localStorage.getItem(KEYS.plugins);
    cachedPlugins = localPlugins ? JSON.parse(localPlugins) : [];
    lastCacheTime = now;
  } catch (error) {
    console.error('Error reading plugins from localStorage for time-series check:', error);
    cachedPlugins = [];
  }
  return cachedPlugins || [];
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.plugins) {
      cachedPlugins = null;
    }
  });
}

/**
 * Check if a KPI is a time-series plugin
 */
export function isTimeSeriesPlugin(pluginId: string): boolean {
  // Normalize plugin ID (remove 'plugin-' prefix if present)
  const normalizedId = pluginId.replace(/^plugin-/, '');

  // Check if plugin ID contains '_trend' (legacy naming for time-series)
  if (normalizedId.includes('_trend') || normalizedId.includes('trend')) {
    return true;
  }

  // Check if plugin ID contains '_weekly' or other time-series patterns
  if (normalizedId.includes('_weekly') || normalizedId.includes('_monthly') || normalizedId.includes('_daily')) {
    return true;
  }

  // Also check plugin category/timeInterval from plugin registry
  if (typeof window !== 'undefined') {
    try {
      const allPlugins = getCachedPlugins();

      // Check if plugin has time-series category or interval
      const plugin = allPlugins.find((p: any) => p.id === normalizedId);
      if (plugin &&
          (plugin.category === 'time-series' ||
           plugin.timeInterval ||
           plugin.visualization === 'line' ||
           plugin.visualization === 'area')) {
        return true;
      }
    } catch (error) {
      console.error('Error checking plugin category:', error);
    }
  }

  return false;
}

/**
 * Get available KPI options for dropdown with improved naming and grouping
 * Returns grouped structure with time-series and regular KPIs separated
 */
export function getKpiOptions(kpiResults: KpiResult[]): {
  timeSeries: Array<{ id: string; label: string }>;
  regular: Array<{ id: string; label: string }>;
} {
  const timeSeries: Array<{ id: string; label: string }> = [];
  const regular: Array<{ id: string; label: string }> = [];

  for (const kpi of kpiResults) {
    const isTrend = isTimeSeriesPlugin(kpi.pluginId);

    // Format plugin ID for display (convert underscores to spaces, capitalize)
    const pluginDisplay = kpi.pluginId
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    // Add emoji indicator for time-series
    if (isTrend) {
      timeSeries.push({ id: kpi.pluginId, label: `📈 ${pluginDisplay}` });
    } else {
      regular.push({ id: kpi.pluginId, label: pluginDisplay });
    }
  }

  // Sort both groups alphabetically
  timeSeries.sort((a, b) => a.label.localeCompare(b.label));
  regular.sort((a, b) => a.label.localeCompare(b.label));

  return { timeSeries, regular };
}

/**
 * Get recommended chart type for a KPI
 */
export function getRecommendedChartType(kpiResults: KpiResult[], kpiId: string): 'bar' | 'line' | 'pie' | 'area' {
  const kpi = kpiResults.find((k) => k.pluginId === kpiId);
  if (!kpi) return 'bar';

  const result = kpi.results[0];
  
  // CFD - recommend area chart
  // @MX:NOTE: Must match the real plugin id; the previous 'cumulative_flow'
  // literal matched nothing, so the area recommendation never fired.
  if (kpi.pluginId === 'cumulative_flow_trend') return 'area';

  // Time-series data - recommend line chart
  if (result?.timeSeries && result.timeSeries.length > 0) return 'line';

  // Distribution - recommend bar chart
  if (kpi.pluginId.includes('histogram') || kpi.pluginId.includes('aging')) return 'bar';

  // Percentage-based KPIs work well with pie charts
  if (result?.unit === '%') return 'pie';

  // Single value without dimensions - bar chart
  if (!result?.dimensions?.status && !result?.dimensions?.priority) return 'bar';

  // Multiple categories - bar chart for comparison
  return 'bar';
}

/**
 * Format value for display
 */
export function formatChartValue(value: number, unit?: string): string {
  if (unit === '%') return `${value.toFixed(1)}%`;
  if (unit === 'hours') return `${value.toFixed(1)}h`;

  // Large numbers
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;

  return `${value.toFixed(1)}${unit || ''}`;
}
