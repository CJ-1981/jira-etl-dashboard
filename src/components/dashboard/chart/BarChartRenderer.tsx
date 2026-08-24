'use client';

import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { hasMultipleTimeSeries, mergeTimeSeries, getUniqueColor } from '@/lib/chart-data-utils';
import type { ChartDatum, ChartRendererBaseProps } from './chart-shared';
import { getTooltipStyle, renderLegendItem, SERIES_LEGEND_LAYOUT } from './chart-shared';
import { ChartTooltip } from './chart-tooltips';

// @MX:NOTE: Age category colors for open tickets visualization
// Green (fresh) → Orange (aging) → Red (stale)
export const AGE_CATEGORY_COLORS = {
  'this_week': '#22c55e',    // green-500
  'last_week': '#f59e0b',    // amber-500
  'existing': '#ef4444',     // red-500
} as const;

/**
 * Bar chart renderer. Dispatches between the multi-series time-series path
 * (one bar per result) and the single-series path (with optional stacked
 * weekly age-breakdown layers). Each branch wraps its recharts chart in a
 * ResponsiveContainer directly — the recharts chart must be the container's
 * direct child so width/height are injected, as in the original branches.
 */
export function BarChartRenderer(props: ChartRendererBaseProps) {
  return hasMultipleTimeSeries(props.seriesResults)
    ? <MultiSeriesBarChart {...props} />
    : <SingleSeriesBarChart {...props} />;
}

function MultiSeriesBarChart({
  kpiId,
  seriesResults,
  unit,
  chartHeight,
  theme,
  hiddenDimensions,
  onLegendClick,
  onDrillDown,
}: ChartRendererBaseProps) {
  const tooltipStyle = getTooltipStyle(theme);
  const renderLegend = renderLegendItem(hiddenDimensions, kpiId);
  const mergedData = mergeTimeSeries(seriesResults) as ChartDatum[];

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
        <YAxis className="text-xs" />
        <Tooltip
          {...tooltipStyle}
          content={<ChartTooltip variant="seriesBar" unit={unit} />}
        />
        <Legend
          onClick={onLegendClick}
          cursor="pointer"
          formatter={renderLegend}
          {...SERIES_LEGEND_LAYOUT}
        />
        {seriesResults.map((result, idx) => (
          <Bar
            key={result.name || idx}
            dataKey={`series${idx}`}
            name={result.name}
            fill={getUniqueColor(idx)}
            radius={[4, 4, 0, 0]}
            hide={hiddenDimensions.has(`${kpiId}|${result.name}`)}
            cursor="pointer"
            onClick={(barData: ChartDatum) => {
              const keys = (barData[`ticketKeys${idx}`] as string[] | undefined) || barData.ticketKeys;
              if (keys && keys.length > 0) {
                onDrillDown(keys, `${result.name} - ${barData.name}`);
              }
            }}
          >
            {mergedData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={getUniqueColor(idx)}
                fillOpacity={entry.isComplete === false ? 0.4 : 1}
              />
            ))}
          </Bar>
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

function SingleSeriesBarChart({
  kpiId,
  data,
  unit,
  chartHeight,
  theme,
  hiddenDimensions,
  onLegendClick,
  onDrillDown,
}: ChartRendererBaseProps) {
  const tooltipStyle = getTooltipStyle(theme);
  const renderLegend = renderLegendItem(hiddenDimensions, kpiId);

  const visibleBarData = data.filter(d => !hiddenDimensions.has(`${kpiId}|${d.name}`));

  // @MX:NOTE: Determine stacked age-breakdown rendering based solely on transformed chart data
  // @MX:REASON: Checking kpi.results.details was too broad — it matched any KPI that reports age
  // labels in its details (e.g. total open-tickets), incorrectly suppressing the plain
  // <Bar dataKey="value"> and rendering bars for undefined fields instead (blank chart).
  // transformForBarChart is the single source of truth for which fields exist in the data.
  const hasWeeklyLayers = visibleBarData.some(d =>
    d.thisWeek !== undefined ||
    d.prevWeek !== undefined ||
    d.existing !== undefined
  );

  // Debug logging
  if (process.env.NODE_ENV === 'development' && kpiId.includes('open_tickets_by')) {
    const firstItem = visibleBarData[0];
    console.log('[ChartCard] Detailed data structure:', {
      kpiId,
      visibleBarDataCount: visibleBarData.length,
      firstItemKeys: Object.keys(firstItem || {}),
      firstItemValues: Object.values(firstItem || {}),
      firstItemRaw: firstItem,
      hasWeeklyLayers,
      shouldRenderAgeBreakdownBars: hasWeeklyLayers,
      chartHeight,
      barConfig: {
        dataKey: 'value',
        dataKeyExistsInFirstItem: 'value' in (firstItem || {}),
        valueOfFirstItem: firstItem?.value
      }
    });
  }

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={visibleBarData} margin={{ top: 20, right: 30, left: 20, bottom: 50 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
        <YAxis className="text-xs" />
        <Tooltip
          {...tooltipStyle}
          content={<ChartTooltip variant="bar" unit={unit} />}
        />
        {hasWeeklyLayers && (
          <Legend
            onClick={onLegendClick}
            cursor="pointer"
            formatter={renderLegend}
            {...SERIES_LEGEND_LAYOUT}
            payload={[
              {
                value: 'This Week',
                type: 'rect' as const,
                id: 'This Week',
                color: AGE_CATEGORY_COLORS.this_week
              },
              {
                value: '1 week old',
                type: 'rect' as const,
                id: '1 week old',
                color: AGE_CATEGORY_COLORS.last_week
              },
              {
                value: '2+ weeks old',
                type: 'rect' as const,
                id: '2+ weeks old',
                color: AGE_CATEGORY_COLORS.existing
              }
            ]}
          />
        )}
        {!hasWeeklyLayers && (
          <Bar
            dataKey="value"
            name="Total"
            fill="#3b82f6"
            hide={hiddenDimensions.has(`${kpiId}|Total`)}
            cursor="pointer"
            onClick={(barData: ChartDatum) => {
              if (barData && barData.ticketKeys) {
                onDrillDown(barData.ticketKeys, barData.name);
              }
            }}
          />
        )}
        {/* @MX:NOTE: Bars must be direct children of BarChart - no Fragment wrapper */}
        {/* @MX:REASON: Recharts scans direct children to register series; a Fragment wrapping */}
        {/* makes the <Bar> components invisible to Recharts, so nothing renders. */}
        {hasWeeklyLayers && (
          <Bar
            dataKey="existing"
            name="2+ weeks old"
            fill={AGE_CATEGORY_COLORS.existing}
            stackId="ageBreakdown"
            cursor="pointer"
            onClick={(barData: ChartDatum) => {
              if (barData && barData.ticketKeys) {
                onDrillDown(barData.ticketKeys, "2+ weeks old");
              }
            }}
          />
        )}
        {hasWeeklyLayers && (
          <Bar
            dataKey="prevWeek"
            name="1 week old"
            fill={AGE_CATEGORY_COLORS.last_week}
            stackId="ageBreakdown"
            cursor="pointer"
            onClick={(barData: ChartDatum) => {
              if (barData && barData.ticketKeys) {
                onDrillDown(barData.ticketKeys, "1 week old");
              }
            }}
          />
        )}
        {hasWeeklyLayers && (
          <Bar
            dataKey="thisWeek"
            name="This Week"
            fill={AGE_CATEGORY_COLORS.this_week}
            stackId="ageBreakdown"
            cursor="pointer"
            onClick={(barData: ChartDatum) => {
              if (barData && barData.ticketKeys) {
                onDrillDown(barData.ticketKeys, "This Week");
              }
            }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
