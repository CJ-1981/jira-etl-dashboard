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
      isComplete?: boolean;
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

  // Determine if we should use a color palette or health-based colors
  // SLA and Processing Time usually benefit from health-based colors (red/amber/emerald)
  const isPerformanceMetric = kpi.pluginId.includes('sla') || kpi.pluginId.includes('processing_time');

  // If we have multiple results, it's likely a breakdown (by status, priority, assignee, etc.)
  if (kpi.results.length > 1 || kpi.results[0]?.dimensions) {
    const sortedResults = [...kpi.results].sort((a, b) => {
      const aDim = Object.values(a.dimensions || {}).join('') || a.name;
      const bDim = Object.values(b.dimensions || {}).join('') || b.name;
      return aDim.localeCompare(bDim, undefined, { numeric: true, sensitivity: 'base' });
    });

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
      const tw = result.details?.find(d => d.label === 'This Week');
      const lw = result.details?.find(d => d.label === 'Previous Week');
      if (tw) dataPoint.thisWeek = Number(tw.value.toFixed(2));
      if (lw) dataPoint.prevWeek = Number(lw.value.toFixed(2));

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

  const tw = result.details?.find(d => d.label === 'This Week');
  const lw = result.details?.find(d => d.label === 'Previous Week');
  if (tw) dataPoint.thisWeek = Number(tw.value.toFixed(2));
  if (lw) dataPoint.prevWeek = Number(lw.value.toFixed(2));

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

  const sortedResults = [...kpi.results].sort((a, b) => {
    const aDim = Object.values(a.dimensions || {}).join('') || a.name;
    const bDim = Object.values(b.dimensions || {}).join('') || b.name;
    return aDim.localeCompare(bDim, undefined, { numeric: true, sensitivity: 'base' });
  });

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
    const sortedResults = [...kpi.results].sort((a, b) => {
      const aDim = Object.values(a.dimensions || {}).join('') || a.name;
      const bDim = Object.values(b.dimensions || {}).join('') || b.name;
      return aDim.localeCompare(bDim, undefined, { numeric: true, sensitivity: 'base' });
    });

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
  return pluginId.includes('_trend');
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
    const rawLabel = kpi.results[0]?.name || kpi.pluginId;

    // Clean up label - remove duplicates and improve formatting
    let label = rawLabel
      .replace('SLA Compliance by Status', 'SLA by Status')
      .replace('SLA Compliance by Priority', 'SLA by Priority')
      .replace('Turnaround Time by Status', 'Time in Status')
      .replace('Processing Time Trend', 'Processing Time')
      .replace('Throughput Trend', 'Throughput')
      .replace('SLA Trend', 'SLA Compliance')
      .replace('Cumulative Flow Diagram', 'Cumulative Flow')
      .replace('Compliance by Status Trend', 'by Status');

    // Add emoji indicator for time-series
    if (isTrend) {
      label = `📈 ${label}`;
      timeSeries.push({ id: kpi.pluginId, label });
    } else {
      regular.push({ id: kpi.pluginId, label });
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
