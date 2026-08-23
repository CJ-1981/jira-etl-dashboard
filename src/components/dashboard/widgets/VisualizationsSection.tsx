'use client';

import { BarChart3, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ChartConfig, KpiCalcResult } from '@/types/dashboard';
import { ChartCard } from '../KpiCard';

export interface VisualizationsSectionProps {
  /** Chart configs visible after plugin filtering. */
  charts: ChartConfig[];
  /** Derived (visible) KPI results the charts draw from. */
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
  onAddChart: () => void;
}

/**
 * "Visualizations" section: grid of user-managed ChartCards plus the dashed
 * "Add Visualization" button (hidden once 12 charts exist).
 */
export function VisualizationsSection({
  charts,
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
  onAddChart,
}: VisualizationsSectionProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-emerald-500" />
          Visualizations
        </h3>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {charts.map((chartConfig) => {
          const widthClass = {
            sm: 'col-span-1',      // 25% width
            md: 'col-span-2',       // 50% width
            lg: 'col-span-3',       // 75% width
            full: 'col-span-4',     // 100% width
          }[chartConfig.width];

          return (
            <div key={chartConfig.id} className={widthClass}>
              <ChartCard
                config={chartConfig}
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
        })}
      </div>

      {charts.length < 12 && (
        <div className="flex justify-center pt-6 no-print">
          <Button
            onClick={onAddChart}
            variant="outline"
            className="group relative border-dashed border-slate-200 dark:border-slate-800 hover:border-emerald-500/50 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-400 hover:text-emerald-500 w-full max-w-sm transition-all duration-300 py-8 h-auto flex flex-col gap-2 rounded-xl"
          >
            <div className="flex items-center gap-2">
              <Plus className="h-5 w-5 transition-transform group-hover:scale-110" />
              <span className="font-semibold text-sm">Add Visualization</span>
            </div>
            <span className="text-[10px] opacity-60 font-normal">Create a new bar, line, or pie chart for your metrics</span>
          </Button>
        </div>
      )}
    </div>
  );
}
