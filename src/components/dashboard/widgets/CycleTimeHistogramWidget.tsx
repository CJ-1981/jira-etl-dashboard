'use client';

import { useMemo } from 'react';
import type { ChartConfig, KpiCalcResult } from '@/types/dashboard';
import { ChartCard } from '../KpiCard';

export interface CycleTimeHistogramWidgetProps {
  /** First KPI of the widget supplies the plugin id for the chart config. */
  kpis: KpiCalcResult[];
  /** Derived (visible) KPI results the chart draws from. */
  kpiResults: KpiCalcResult[];
  hiddenDimensions: string[];
  toggleDimension: (pluginId: string, value: string) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, newConfig: ChartConfig) => void;
  onMoveUp?: (id: string) => void;
  onMoveDown?: (id: string) => void;
  onDrillDown: (keys: string[], title: string) => void;
  theme: string;
  calculateWidgetJql?: (widgetId: string, jqlFilter: any) => void;
  /**
   * Collapse state from the shared `collapsedWidgets` store (keyed by the
   * widget's plugin id) and its toggle. The card's config id is synthesized
   * here and has no `dashboardCharts` entry, so ChartCard's own store toggle
   * would silently no-op — the state must be controlled from outside.
   */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
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
  collapsed = false,
  onToggleCollapse,
}: CycleTimeHistogramWidgetProps) {
  const pluginId = kpis[0].pluginId;

  // The config is synthesized per render — memoize it so ChartCard's memo
  // comparison doesn't see a fresh object identity on every parent render.
  const config = useMemo<ChartConfig>(() => ({
    id: `cycle-time-histogram-${pluginId}`,
    type: 'bar',
    kpiId: pluginId,
    width: 'lg',
    height: 'md',
    jqlFilter: { enabled: false, query: '', mode: 'override' }
  }), [pluginId]);

  return (
    <div className="col-span-1 md:col-span-2 lg:col-span-3">
      <ChartCard
        config={config}
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
        expanded={!collapsed}
        onToggleCollapse={onToggleCollapse}
        // The synthesized config id has no dashboardCharts entry — the
        // remove/rename/move/config controls would be silent no-ops, so the
        // card renders as a derived plugin chart (collapse + JQL filter only).
        userManaged={false}
      />
    </div>
  );
}
