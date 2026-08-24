'use client';

import { ReferenceLine } from 'recharts';
import type { TimeSeriesSource } from '@/lib/chart-data-utils';

/**
 * One series row consumed by the chart renderers. Structural on purpose:
 * both the dashboard's `KpiCalcResult['results']` rows and the lib's
 * `KpiResult['results']` rows satisfy it, so no bridging casts are needed.
 */
export interface ChartSeriesResult extends TimeSeriesSource {
  name: string;
  slaTargetHours?: number;
}

/** Series result rows of the KPI selected for a chart. */
export type ChartSeriesResults = ChartSeriesResult[];

/** Callback that opens the drill-down sheet for a set of ticket keys. */
export type ChartDrillDown = (keys: string[], title: string) => void;

/** Legend payload entries carry the series name as `id` or `value`. */
export interface ChartLegendEntry {
  id?: string;
  value?: string;
}

/** Shape of a data point flowing through the charts (transform or merged rows). */
export interface ChartDatum {
  name: string;
  value?: number;
  fill?: string;
  unit?: string;
  ticketKeys?: string[];
  isComplete?: boolean;
  thisWeek?: number;
  prevWeek?: number;
  existing?: number;
  [key: string]: unknown;
}

/** Props shared by every chart-type renderer. */
export interface ChartRendererBaseProps {
  /** Selected KPI id (used for hidden-dimension lookups). */
  kpiId: string;
  /** Original chart type from the widget config (drives tooltip ordering). */
  configType: 'bar' | 'line' | 'pie' | 'area';
  /** Single-series data produced by the transform helpers. */
  data: ChartDatum[];
  /** All series results of the selected KPI (empty when none). */
  seriesResults: ChartSeriesResults;
  /** Unit of the first result — used for tooltip value formatting. */
  unit: string;
  /** Pixel height resolved from the widget height setting. */
  chartHeight: number;
  theme: 'light' | 'dark';
  hiddenDimensions: string[];
  onLegendClick: (entry: ChartLegendEntry) => void;
  onDrillDown: ChartDrillDown;
  /** Chart-level SLA target (fallback when a series has none of its own). */
  slaTarget: number | null;
}

/** Theme-aware content styles for recharts <Tooltip>. */
export function getTooltipStyle(theme: 'light' | 'dark') {
  return {
    contentStyle: {
      backgroundColor: theme === 'dark' ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)',
      border: theme === 'dark' ? '1px solid rgba(148, 163, 184, 0.2)' : '1px solid rgba(226, 232, 240, 0.8)',
      borderRadius: '8px',
    },
    labelStyle: { color: theme === 'dark' ? '#e2e8f0' : '#1e293b' },
    itemStyle: { color: theme === 'dark' ? '#e2e8f0' : '#1e293b' },
  };
}

/** Shared Legend placement used by every multi-series chart. */
export const SERIES_LEGEND_LAYOUT = {
  verticalAlign: 'top',
  align: 'right',
  wrapperStyle: { paddingBottom: '20px' },
} as const;

/**
 * Legend item formatter that strikes through dimensions hidden via
 * legend clicks.
 */
export function renderLegendItem(hiddenDimensions: string[], kpiId: string) {
  // Recharts legend `formatter` callback (returns ReactNode), not a component.
  // eslint-disable-next-line react/display-name
  return (value: string) => {
    const isHidden = hiddenDimensions.includes(`${kpiId}|${value}`);
    return (
      <span
        className={`
            text-[10px] font-medium transition-all cursor-pointer select-none
            hover:text-blue-500 hover:underline
            ${isHidden ? 'opacity-30 line-through text-slate-500' : 'text-slate-700 dark:text-slate-300'}
          `}
      >
        {value}
      </span>
    );
  };
}

/** Shared styling for the amber dashed SLA target reference lines. */
function slaLineProps(target: number, label: string) {
  return {
    y: target,
    stroke: '#f59e0b',
    strokeWidth: 2,
    strokeDasharray: '5 5',
    label: {
      value: label,
      position: 'insideBottomRight',
      fill: '#f59e0b',
      fontSize: 10,
      fontWeight: 600,
    },
  } as const;
}

/**
 * One SLA target line for a chart without per-series targets
 * (standard line/area paths). Renders nothing when the target is unusable.
 */
export function SlaTargetLine({ slaTarget }: { slaTarget: number | null }) {
  if (slaTarget === null || isNaN(slaTarget)) return null;
  return <ReferenceLine {...slaLineProps(slaTarget, `SLA: ${slaTarget}h`)} />;
}

/**
 * Per-series SLA target lines for multi-series line/area charts: each visible
 * series prefers its own `slaTargetHours` and falls back to the chart-level
 * target.
 *
 * @param labelPrefix multi-series line charts label targets `${target}h`;
 *   area charts use `SLA: ${target}h`.
 * @param keyPrefix keeps React keys distinct between line and area charts.
 */
export function SeriesSlaTargetLines({
  seriesResults,
  kpiId,
  hiddenDimensions,
  slaTarget,
  labelPrefix,
  keyPrefix,
}: {
  seriesResults: ChartSeriesResults;
  kpiId: string;
  hiddenDimensions: string[];
  slaTarget: number | null;
  labelPrefix: string;
  keyPrefix: string;
}) {
  return (
    <>
      {seriesResults.map((result, idx) => {
        if (hiddenDimensions.includes(`${kpiId}|${result.name}`)) return null;
        const target = result.slaTargetHours ?? slaTarget;
        if (target === null || target === undefined || isNaN(target)) return null;
        return (
          <ReferenceLine
            key={`${keyPrefix}-${result.name}-${idx}`}
            {...slaLineProps(target, `${labelPrefix}${target}h`)}
          />
        );
      })}
    </>
  );
}

/**
 * Extract the data row from an active-dot click argument.
 *
 * @MX:WARN recharts types the activeDot onClick as `(props, DOM event)` but
 * its double event adaptation (generateCategoricalChart -> Dot) actually
 * invokes it as `(activeDotProps, dotProps)` where `dotProps.payload` is the
 * clicked data point. This guard recovers that datum without `any`.
 */
function getActiveDotDatum(value: unknown): ChartDatum | null {
  if (typeof value !== 'object' || value === null || !('payload' in value)) {
    return null;
  }
  const payload = (value as { payload: unknown }).payload;
  if (typeof payload !== 'object' || payload === null) return null;
  return payload as ChartDatum;
}

/**
 * Build the `activeDot` config used by line/area series for drill-down:
 * clicking an active dot opens the ticket list for the point's keys.
 */
export function drillDownActiveDot(
  getKeys: (datum: ChartDatum) => string[] | undefined,
  getTitle: (datum: ChartDatum) => string,
  onDrillDown: ChartDrillDown,
) {
  return {
    onClick: (_props: unknown, point: unknown) => {
      const datum = getActiveDotDatum(point);
      if (!datum) return;
      const keys = getKeys(datum);
      if (keys && keys.length > 0) {
        onDrillDown(keys, getTitle(datum));
      }
    },
    cursor: 'pointer',
  };
}
