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
    timeSeries?: Array<{
      period: string;
      date: Date;
      value: number;
      count: number;
      isComplete?: boolean;
    }>;
  }>;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  fill?: string;
  date?: Date;
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
};

export const CHART_COLORS = [
  COLORS.emerald,
  COLORS.blue,
  COLORS.amber,
  COLORS.purple,
  COLORS.cyan,
  COLORS.pink,
  COLORS.orange,
  COLORS.red,
];

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
      r.details?.some((d: any) => ['This Week', '1 week old', '2+ weeks old', 'Previous Week'].includes(d.label))
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
            fill: CHART_COLORS[grouped.size % CHART_COLORS.length]
          });
        }

        const group = grouped.get(baseName)!;
        const resultWithKeys = result as any;

        // Categorize by age based on naming pattern or dimensions
        // Check both naming pattern and dimensions.ageCategory
        const isExisting = result.name.includes('(Existing)') ||
                          result.name.toLowerCase().includes('existing') ||
                          result.dimensions?.ageCategory === 'existing' ||
                          result.details?.some((d: any) => d.label === '2+ weeks old');
        const isLastWeek = result.name.includes('(Last Week)') ||
                           result.name.toLowerCase().includes('last week') ||
                           result.dimensions?.ageCategory === 'last_week' ||
                           result.details?.some((d: any) => d.label === '1 week old' || d.label === 'Previous Week');
        const isThisWeek = result.name.includes('(This Week)') ||
                           result.name.toLowerCase().includes('this week') ||
                           result.dimensions?.ageCategory === 'this_week' ||
                           result.details?.some((d: any) => d.label === 'This Week');

        if (isExisting) {
          group.existing += result.value;
          group.ticketKeys.push(...(resultWithKeys.ticketKeys || []));
        } else if (isLastWeek) {
          group.prevWeek += result.value;
          group.ticketKeys.push(...(resultWithKeys.ticketKeys || []));
        } else if (isThisWeek) {
          group.thisWeek += result.value;
          group.ticketKeys.push(...(resultWithKeys.ticketKeys || []));
        } else {
          // Fallback: use as total value (shouldn't happen for age breakdown plugins)
          group.existing += result.value;
          group.ticketKeys.push(...(resultWithKeys.ticketKeys || []));
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
        : CHART_COLORS[index % CHART_COLORS.length];

      const dataPoint: ChartDataPoint = {
        name: dimensionName,
        value: Number(result.value.toFixed(2)),
        fill: color,
        ticketKeys: (result as any).ticketKeys || [],
      };

      // Add isComplete if it's a timeSeries point (unlikely for distribution but good for consistency)
      if ((result as any).isComplete !== undefined) dataPoint.isComplete = (result as any).isComplete;

      // Add weekly breakdown if available in details
      // Support both old format (This Week/Previous Week) and new format (This Week/1 week old/2+ weeks old)
      const tw = result.details?.find(d => d.label === 'This Week');
      const lw = result.details?.find(d => d.label === '1 week old' || d.label === 'Previous Week');
      const existing = result.details?.find(d => d.label === '2+ weeks old');
      if (tw) dataPoint.thisWeek = Number(tw.value.toFixed(2));
      if (lw) dataPoint.prevWeek = Number(lw.value.toFixed(2));
      if (existing) dataPoint.existing = Number(existing.value.toFixed(2));

      return dataPoint;
    });
  }

  // Single value - show as one bar
  const result = kpi.results[0];
  const dataPoint: ChartDataPoint = {
    name: result.name,
    value: Number(result.value.toFixed(2)),
    fill: getColorForValue(result.value, result.unit),
    ticketKeys: (result as any).ticketKeys || [],
  };

  // Support both old format (This Week/Previous Week) and new format (This Week/1 week old/2+ weeks old)
  const tw = result.details?.find(d => d.label === 'This Week');
  const lw = result.details?.find(d => d.label === '1 week old' || d.label === 'Previous Week');
  const existing = result.details?.find(d => d.label === '2+ weeks old');
  if (tw) dataPoint.thisWeek = Number(tw.value.toFixed(2));
  if (lw) dataPoint.prevWeek = Number(lw.value.toFixed(2));
  if (existing) dataPoint.existing = Number(existing.value.toFixed(2));

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
      fill: CHART_COLORS[index % CHART_COLORS.length],
      unit: result.unit, // Pass unit for better formatting in Pie labels
      ticketKeys: (result as any).ticketKeys || [],
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
      ticketKeys: (point as any).ticketKeys || [],
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
        ticketKeys: (result as any).ticketKeys || [],
      };
    });
  }

  // Single value - create a simple trend point
  const result = kpi.results[0];
  return [
    {
      name: result.name,
      value: Number((result.value || 0).toFixed(2)),
      ticketKeys: (result as any).ticketKeys || [],
    },
  ];
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

  // Check for specific time-series plugin IDs
  const timeSeriesPluginIds = [
    'open_tickets_by_assignee_trend',
    'open_tickets_by_priority_trend',
    'open_tickets_by_status_trend',
    'throughput_trend',
    'cumulative_flow'
  ];

  if (timeSeriesPluginIds.includes(normalizedId)) {
    return true;
  }

  // Also check plugin category/timeInterval from plugin registry
  if (typeof window !== 'undefined') {
    try {
      const allPlugins: any[] = [];
      // Check both localStorage and API for plugins
      const localPlugins = localStorage.getItem(KEYS.plugins);
      if (localPlugins) {
        allPlugins.push(...JSON.parse(localPlugins));
      }

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
  if (kpi.pluginId === 'cumulative_flow') return 'area';

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
