'use client';

import type { ChartConfig, KpiCalcResult } from '@/types/dashboard';
import { ChartCard } from '../KpiCard';

export interface CycleTimeHistogramWidgetProps {
  /** First KPI of the widget supplies the plugin id for the chart config. */
  kpis: KpiCalcResult[];
  /** Derived (visible) KPI results the chart draws from. */
  kpiResults: KpiCalcResult[];
  hiddenDimensions: Set<string>;
  toggleDimension: (pluginId: string, value: string) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, newConfig: ChartConfig) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onDrillDown: (keys: string[], title: string) => void;
  theme: string;
  calculateWidgetJql?: (widgetId: string, jqlFilter: any) => void;
}

/**
 * Cycle-time histogram widget (component type `cycle-time-histogram`,
 * e.g. `cycle_time_histogram` / `aging_wip`). Renders the histogram through
 * the shared ChartCard renderer inside a full-width grid wrapper.
 */
export function CycleTimeHistogramWidget({
  kpis,
  kpiResults,
  hiddenDimensions,
  toggleDimension,
  onRemove,
  onChange,
  onMoveUp,
  onMoveDown,
  onDrillDown,
  theme,
  calculateWidgetJql,
}: CycleTimeHistogramWidgetProps) {
  const pluginId = kpis[0].pluginId;

  return (
    <div className="col-span-1 md:col-span-2 lg:col-span-3">
      <ChartCard
        config={{
          id: `cycle-time-histogram-${pluginId}`,
          type: 'bar',
          kpiId: pluginId,
          width: 'lg',
          height: 'md',
          jqlFilter: { enabled: false, query: '', mode: 'override' }
        }}
        kpiResults={kpiResults}
        hiddenDimensions={hiddenDimensions}
        toggleDimension={toggleDimension}
        onRemove={onRemove}
        onChange={onChange}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        onClick={onDrillDown}
        theme={theme as any}
        calculateWidgetJql={calculateWidgetJql}
      />
    </div>
  );
}
