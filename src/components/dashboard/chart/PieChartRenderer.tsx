'use client';

import {
  PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { formatChartValue, getUniqueColor } from '@/lib/chart-data-utils';
import type { ChartDatum, ChartRendererBaseProps } from './chart-shared';
import { getTooltipStyle, renderLegendItem, SERIES_LEGEND_LAYOUT } from './chart-shared';
import { ChartTooltip } from './chart-tooltips';

/** Slice fields recharts merges into the pie onClick entry. */
interface PieClickEntry {
  name?: string;
  ticketKeys?: string[];
  payload?: ChartDatum;
}

/**
 * Pie chart renderer. Slices honor per-datum colors (`fill`) and drill down
 * into ticket keys on click. Hidden dimensions are filtered out. Wraps the
 * chart in a ResponsiveContainer so recharts receives injected dimensions.
 */
export function PieChartRenderer({
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

  const visiblePieData = data.filter(d => !hiddenDimensions.includes(`${kpiId}|${d.name}`));

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <PieChart>
        {/* @MX:ANCHOR: Pie Chart Rendering */}
        <Pie
          data={visiblePieData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, value, payload }) => `${name}: ${formatChartValue(value, payload.unit)}`}
          outerRadius={80}
          fill="#8884d8"
          dataKey="value"
          onClick={(entry: PieClickEntry) => {
            const keys = entry.ticketKeys || (entry.payload && entry.payload.ticketKeys);
            if (keys && keys.length > 0) {
              onDrillDown(keys, entry.name || (entry.payload && entry.payload.name) || 'Selected Item');
            }
          }}
          cursor="pointer"
        >
          {visiblePieData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill || getUniqueColor(index)} />
          ))}
        </Pie>
        <Legend
          onClick={onLegendClick}
          cursor="pointer"
          formatter={renderLegend}
          {...SERIES_LEGEND_LAYOUT}
        />
        <Tooltip
          {...tooltipStyle}
          content={<ChartTooltip variant="pie" unit={unit} />}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
