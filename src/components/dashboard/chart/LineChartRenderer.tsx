'use client';

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { hasMultipleTimeSeries, mergeTimeSeries, getUniqueColor, getUniqueDashArray } from '@/lib/chart-data-utils';
import type { ChartDatum, ChartRendererBaseProps } from './chart-shared';
import {
  getTooltipStyle,
  renderLegendItem,
  SERIES_LEGEND_LAYOUT,
  SeriesSlaTargetLines,
  SlaTargetLine,
  drillDownActiveDot,
} from './chart-shared';
import { ChartTooltip } from './chart-tooltips';
import type { ChartMouseState, ChartZoomState } from './chart-zoom';
import { sliceForZoom, ZoomSelectionArea } from './chart-zoom';

export interface LineChartRendererProps extends ChartRendererBaseProps {
  zoomState: ChartZoomState;
  zoomMouseHandlers: {
    onMouseDown: (e: ChartMouseState) => void;
    onMouseMove: (e: ChartMouseState) => void;
    onMouseUp: () => void;
  };
}

/** Dot renderer factory: incomplete periods draw a dashed hollow circle. */
function seriesDotRenderer(color: string, keyPrefix: string) {
  // Recharts `dot` render-prop callback (returns an SVG element), not a component.
  // eslint-disable-next-line react/display-name
  return (props: { cx?: number; cy?: number; payload?: ChartDatum }) => {
    const { cx, cy, payload } = props;
    if (payload?.isComplete === false) {
      return (
        <circle
          key={`dot-${keyPrefix}${payload.name}`}
          cx={cx} cy={cy} r={4}
          fill="transparent"
          stroke={color}
          strokeWidth={2}
          strokeDasharray="2 2"
        />
      );
    }
    return <circle key={`dot-${keyPrefix}${payload?.name}`} cx={cx} cy={cy} r={4} fill={color} />;
  };
}

/**
 * Line chart renderer. Multi-series time-series KPIs render one line per
 * result (with per-series SLA target lines); everything else renders a single
 * value line. Both support drag-to-zoom. Each branch wraps its recharts chart
 * in a ResponsiveContainer directly so width/height are injected.
 */
export function LineChartRenderer(props: LineChartRendererProps) {
  return hasMultipleTimeSeries(props.seriesResults)
    ? <MultiSeriesLineChart {...props} />
    : <SingleSeriesLineChart {...props} />;
}

function MultiSeriesLineChart({
  kpiId,
  configType,
  seriesResults,
  unit,
  chartHeight,
  theme,
  hiddenDimensions,
  onLegendClick,
  onDrillDown,
  slaTarget,
  zoomState,
  zoomMouseHandlers,
}: LineChartRendererProps) {
  const tooltipStyle = getTooltipStyle(theme);
  const renderLegend = renderLegendItem(hiddenDimensions, kpiId);
  // Tooltip ordering follows the ORIGINAL config.type (matching the legacy
  // inline tooltip): only an explicit line chart sorts rows by value; a
  // bar/pie widget forced to line for time-series keeps natural order.
  const tooltipVariant = configType === 'line' ? 'line' : 'seriesBar';

  const mergedData = mergeTimeSeries(seriesResults) as ChartDatum[];

  // Filter data based on zoom state
  const zoomedData = sliceForZoom(mergedData, zoomState);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <LineChart
        data={zoomedData}
        margin={{ top: 20, right: 60, left: 20, bottom: 80 }}
        {...zoomMouseHandlers}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis
          dataKey="name"
          className="text-xs"
          angle={-45}
          textAnchor="end"
          height={60}
          interval="preserveStartEnd"
        />
        <YAxis className="text-xs" />
        <Tooltip
          {...tooltipStyle}
          content={<ChartTooltip variant={tooltipVariant} unit={unit} />}
        />
        <Legend
          onClick={onLegendClick}
          cursor="pointer"
          formatter={renderLegend}
          {...SERIES_LEGEND_LAYOUT}
        />
        <ZoomSelectionArea data={mergedData} zoomState={zoomState} />
        {seriesResults.map((result, idx) => {
          const color = getUniqueColor(idx);
          const dashArray = getUniqueDashArray(idx);
          return (
            <Line
              key={result.name || idx}
              type="monotone"
              dataKey={`series${idx}`}
              name={result.name}
              stroke={color}
              strokeWidth={2}
              strokeDasharray={dashArray}
              activeDot={drillDownActiveDot(
                (datum) => datum[`ticketKeys${idx}`] as string[] | undefined,
                (datum) => `${result.name} - ${datum.name}`,
                onDrillDown,
              )}
              dot={seriesDotRenderer(color, `${idx}-`)}
              hide={hiddenDimensions.has(`${kpiId}|${result.name}`)}
            />
          );
        })}
        {/* SLA Target Reference Lines — prefer each series' own target, fall back to the chart-level target */}
        <SeriesSlaTargetLines
          seriesResults={seriesResults}
          kpiId={kpiId}
          hiddenDimensions={hiddenDimensions}
          slaTarget={slaTarget}
          labelPrefix=""
          keyPrefix="sla-ref"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function SingleSeriesLineChart({
  data,
  unit,
  configType,
  chartHeight,
  theme,
  onDrillDown,
  slaTarget,
  zoomState,
  zoomMouseHandlers,
}: LineChartRendererProps) {
  const tooltipStyle = getTooltipStyle(theme);
  const tooltipVariant = configType === 'line' ? 'line' : 'seriesBar';

  const visibleData = data || [];
  const zoomedData = sliceForZoom(visibleData, zoomState);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <LineChart
        data={zoomedData}
        margin={{ top: 20, right: 60, left: 20, bottom: 50 }}
        {...zoomMouseHandlers}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
        <YAxis className="text-xs" />
        <Tooltip
          {...tooltipStyle}
          content={<ChartTooltip variant={tooltipVariant} unit={unit} />}
        />
        <ZoomSelectionArea data={visibleData} zoomState={zoomState} />
        {/* @MX:ANCHOR: Line Chart (Standard) */}
        <Line
          type="monotone"
          dataKey="value"
          stroke={getUniqueColor(0)}
          strokeWidth={2}
          activeDot={drillDownActiveDot(
            (datum) => datum.ticketKeys,
            (datum) => datum.name || 'Total Period',
            onDrillDown,
          )}
          dot={seriesDotRenderer('#3b82f6', '')}
        />
        {/* SLA Target Reference Line */}
        <SlaTargetLine slaTarget={slaTarget} />
      </LineChart>
    </ResponsiveContainer>
  );
}
