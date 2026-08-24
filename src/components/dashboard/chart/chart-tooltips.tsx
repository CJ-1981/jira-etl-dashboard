'use client';

import type { TooltipProps } from 'recharts';
import { formatChartValue, getUniqueColor } from '@/lib/chart-data-utils';

/** Tooltip payload entry type derived from recharts' own TooltipProps. */
export type ChartTooltipProps = TooltipProps<number, string>;
type TooltipPayloadEntry = NonNullable<ChartTooltipProps['payload']>[number];

/**
 * Which tooltip implementation to emulate:
 * - 'line' / 'area': series colors + chart unit; area rows reversed, line
 *   rows sorted by value (top to bottom).
 * - 'seriesBar': multi-series bar charts — same series colors + chart unit,
 *   no reordering.
 * - 'bar': single-series bars — per-entry color, per-row unit.
 * - 'pie': single row titled with the slice name.
 */
export type ChartTooltipVariant = 'line' | 'area' | 'seriesBar' | 'bar' | 'pie';

function isZeroish(value: number | undefined | null): boolean {
  return value === 0 || value === undefined || value === null;
}

/** Variants that show per-series colors derived from the series<N> dataKey. */
function isSeriesVariant(variant: ChartTooltipVariant): boolean {
  return variant === 'line' || variant === 'area' || variant === 'seriesBar';
}

/** Resolve the swatch color for a tooltip row. */
function seriesColor(entry: TooltipPayloadEntry, variant: ChartTooltipVariant): string {
  if (variant === 'pie') {
    return entry.color || entry.payload?.fill || '#3b82f6';
  }
  if (variant === 'bar') {
    return entry.color || '#3b82f6';
  }
  // line/area/seriesBar: rows key their color off the series<N> dataKey
  if (typeof entry.dataKey === 'string' && entry.dataKey.startsWith('series')) {
    const seriesMatch = entry.dataKey.match(/series(\d+)/);
    const seriesIndex = seriesMatch ? parseInt(seriesMatch[1], 10) : 0;
    return getUniqueColor(seriesIndex);
  }
  return '#3b82f6'; // default blue for single series
}

function TooltipRow({
  color,
  label,
  value,
  unit,
}: {
  color: string;
  label: string;
  value: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-xs">
      <div className="flex items-center gap-1">
        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-slate-600 dark:text-slate-400">{label}</span>
      </div>
      <span className="font-mono text-slate-700 dark:text-slate-300">{formatChartValue(value, unit)}</span>
    </div>
  );
}

/**
 * Consolidated custom tooltip for all chart types. Replaces three
 * near-identical inline implementations (line/area, bar, pie) with one
 * component; the `variant` prop keeps the exact per-type ordering, color and
 * unit behavior:
 * - area rows are reversed to match visual stacking (top to bottom)
 * - line rows are sorted by value to match visual position (top to bottom)
 * - pie shows a single row titled with the slice name
 */
export function ChartTooltip({
  active,
  payload,
  variant,
  unit,
}: Pick<ChartTooltipProps, 'active' | 'payload'> & {
  variant: ChartTooltipVariant;
  /** Unit of the first KPI result; rows may override it from their own payload. */
  unit: string;
}) {
  if (!active || !payload || !payload.length) return null;

  // Pie charts hide the tooltip entirely for zero-value slices.
  if (variant === 'pie' && isZeroish(payload[0].value)) return null;

  const headerTitle = variant === 'pie' ? payload[0].name : payload[0].payload?.name;

  let orderedPayload: TooltipPayloadEntry[] = payload;
  if (variant === 'area') {
    orderedPayload = [...payload].reverse();
  } else if (variant === 'line') {
    orderedPayload = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg p-2">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">{headerTitle}</p>
      {orderedPayload.map((entry, index) => {
        // Skip zero values
        if (isZeroish(entry.value)) return null;

        const rowUnit = isSeriesVariant(variant)
          ? unit
          : entry.payload?.unit || unit;
        const label = variant === 'pie' ? 'Value' : String(entry.name ?? '');

        return (
          <TooltipRow
            key={index}
            color={seriesColor(entry, variant)}
            label={label}
            value={entry.value as number}
            unit={rowUnit}
          />
        );
      })}
    </div>
  );
}
