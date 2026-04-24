/**
 * Chart Data Transformation Utilities
 *
 * Transforms KPI results into chart-friendly data formats for Recharts
 */

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
    }>;
  }>;
}

export interface ChartDataPoint {
  name: string;
  value: number;
  fill?: string;
  date?: Date;
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

  // If results have dimensions (status/priority breakdown), use them
  if (kpi.results[0]?.dimensions?.status || kpi.results[0]?.dimensions?.priority) {
    return kpi.results.map((result, index) => {
      const dimensionName =
        result.dimensions?.status ||
        result.dimensions?.priority ||
        result.name;
      const color = getColorForValue(result.value, result.unit);
      return {
        name: dimensionName,
        value: Number(result.value.toFixed(2)),
        fill: color,
      };
    });
  }

  // Single value - show as one bar
  const result = kpi.results[0];
  return [
    {
      name: result.name,
      value: Number(result.value.toFixed(2)),
      fill: getColorForValue(result.value, result.unit),
    },
  ];
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

  return kpi.results.map((result, index) => {
    const dimensionName =
      result.dimensions?.status ||
      result.dimensions?.priority ||
      result.name;
    return {
      name: dimensionName,
      value: Number(result.value.toFixed(2)),
      fill: CHART_COLORS[index % CHART_COLORS.length],
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

  // Check if time-series data is available
  if (kpi.results[0]?.timeSeries && kpi.results[0].timeSeries.length > 0) {
    return kpi.results[0].timeSeries.map((point) => ({
      name: point.period,
      value: Number(point.value.toFixed(2)),
      date: point.date,
    }));
  }

  // Fallback: treat dimensions as x-axis categories
  if (kpi.results[0]?.dimensions?.status || kpi.results[0]?.dimensions?.priority) {
    return kpi.results.map((result) => {
      const dimensionName =
        result.dimensions?.status ||
        result.dimensions?.priority ||
        result.name;
      return {
        name: dimensionName,
        value: Number(result.value.toFixed(2)),
      };
    });
  }

  // Single value - create a simple trend point
  const result = kpi.results[0];
  return [
    {
      name: result.name,
      value: Number(result.value.toFixed(2)),
    },
  ];
}

/**
 * Check if a KPI is a time-series plugin
 */
export function isTimeSeriesPlugin(pluginId: string): boolean {
  return pluginId.includes('_trend') || pluginId.includes('_trend');
}

/**
 * Get available KPI options for dropdown with time-series indicators
 */
export function getKpiOptions(kpiResults: KpiResult[]): Array<{ id: string; label: string; isTrend?: boolean }> {
  return kpiResults.map((kpi) => {
    const isTrend = isTimeSeriesPlugin(kpi.pluginId);
    const label = kpi.results[0]?.name || kpi.pluginId;

    return {
      id: kpi.pluginId,
      label: isTrend ? `📈 ${label}` : label,
      isTrend,
    };
  });
}

/**
 * Get recommended chart type for a KPI
 */
export function getRecommendedChartType(kpiResults: KpiResult[], kpiId: string): 'bar' | 'line' | 'pie' {
  const kpi = kpiResults.find((k) => k.pluginId === kpiId);
  if (!kpi) return 'bar';

  const result = kpi.results[0];

  // Time-series data - recommend line chart
  if (result?.timeSeries && result.timeSeries.length > 0) return 'line';

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
