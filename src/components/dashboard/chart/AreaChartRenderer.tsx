'use client';

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { hasMultipleTimeSeries, mergeTimeSeries, getUniqueColor } from '@/lib/chart-data-utils';
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

export interface AreaChartRendererProps extends ChartRendererBaseProps {
  zoomState: ChartZoomState;
  zoomMouseHandlers: {
    onMouseDown: (e: ChartMouseState) => void;
    onMouseMove: (e: ChartMouseState) => void;
    onMouseUp: () => void;
  };
}

/**
 * Area chart renderer. Multi-series time-series KPIs render one stacked area
 * per result (with per-series SLA target lines); everything else renders a
 * single area. Both support drag-to-zoom. Each branch wraps its recharts chart
 * in a ResponsiveContainer directly so width/height are injected.
 */
export function AreaChartRenderer(props: AreaChartRendererProps) {
  return hasMultipleTimeSeries(props.seriesResults)
    ? <MultiSeriesAreaChart {...props} />
    : <SingleSeriesAreaChart {...props} />;
}

function MultiSeriesAreaChart({
  kpiId,
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
}: AreaChartRendererProps) {
  const tooltipStyle = getTooltipStyle(theme);
  const renderLegend = renderLegendItem(hiddenDimensions, kpiId);

  // Area charts ignore per-period completeness, so skip the isComplete field.
  const mergedData = mergeTimeSeries(seriesResults, { trackCompleteness: false }) as ChartDatum[];

  // Filter data based on zoom state
  const zoomedData = sliceForZoom(mergedData, zoomState);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <AreaChart
        data={zoomedData}
        margin={{ top: 20, right: 60, left: 20, bottom: 50 }}
        {...zoomMouseHandlers}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
        <YAxis className="text-xs" />
        <Tooltip
          {...tooltipStyle}
          content={<ChartTooltip variant="area" unit={unit} />}
        />
        <Legend
          onClick={onLegendClick}
          cursor="pointer"
          formatter={renderLegend}
          {...SERIES_LEGEND_LAYOUT}
        />
        <ZoomSelectionArea data={mergedData} zoomState={zoomState} />
        {seriesResults.map((result, idx) => (
          <Area
            key={result.name || idx}
            type="monotone"
            dataKey={`series${idx}`}
            name={result.name}
            stackId="1"
            stroke={getUniqueColor(idx)}
            fill={getUniqueColor(idx)}
            fillOpacity={0.6}
            hide={hiddenDimensions.has(`${kpiId}|${result.name}`)}
            activeDot={drillDownActiveDot(
              (datum) => datum[`ticketKeys${idx}`] as string[] | undefined,
              (datum) => `${result.name} - ${datum.name}`,
              onDrillDown,
            )}
          />
        ))}
        {/* SLA Target Reference Lines — prefer each series' own target, fall back to the chart-level target */}
        <SeriesSlaTargetLines
          seriesResults={seriesResults}
          kpiId={kpiId}
          hiddenDimensions={hiddenDimensions}
          slaTarget={slaTarget}
          labelPrefix="SLA: "
          keyPrefix="sla-ref-area"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function SingleSeriesAreaChart({
  data,
  unit,
  chartHeight,
  theme,
  onDrillDown,
  slaTarget,
  zoomState,
  zoomMouseHandlers,
}: AreaChartRendererProps) {
  const tooltipStyle = getTooltipStyle(theme);

  const visibleData = data || [];
  const zoomedData = sliceForZoom(visibleData, zoomState);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <AreaChart
        data={zoomedData}
        margin={{ top: 20, right: 60, left: 20, bottom: 50 }}
        {...zoomMouseHandlers}
      >
        <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
        <XAxis dataKey="name" className="text-xs" angle={-45} textAnchor="end" height={60} interval="preserveStartEnd" />
        <YAxis className="text-xs" />
        <Tooltip
          {...tooltipStyle}
          content={<ChartTooltip variant="area" unit={unit} />}
        />
        <ZoomSelectionArea data={visibleData} zoomState={zoomState} />
        {/* @MX:ANCHOR: Area Chart (Standard) */}
        <Area
          type="monotone"
          dataKey="value"
          stroke="#3b82f6"
          fill="#3b82f6"
          fillOpacity={0.6}
          activeDot={drillDownActiveDot(
            (datum) => datum.ticketKeys,
            (datum) => datum.name || 'Total Period',
            onDrillDown,
          )}
        />
        {/* SLA Target Reference Line */}
        <SlaTargetLine slaTarget={slaTarget} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
