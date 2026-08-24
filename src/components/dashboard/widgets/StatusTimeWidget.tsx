'use client';

import { Timer, EyeOff } from 'lucide-react';
import type { KpiCalcResult } from '@/types/dashboard';
import { WidgetCard } from './WidgetCard';
import type { DrillDownHandler } from './types';

export interface StatusTimeWidgetProps {
  kpi: KpiCalcResult;
  isExpanded: boolean;
  onToggleCollapse: (pluginId: string) => void;
  hiddenDimensions: Set<string>;
  onRestoreAll: (prefix: string) => void;
  onToggleDimension: (pluginId: string, value: string) => void;
  onDrillDown: DrillDownHandler;
  pluginDescription?: string;
}

/**
 * "Turnaround Time by Status" widget (component type `status-time`,
 * plugin `time_in_status`). Renders one horizontal bar per status showing
 * average turnaround time.
 */
export function StatusTimeWidget({
  kpi,
  isExpanded,
  onToggleCollapse,
  hiddenDimensions,
  onRestoreAll,
  onToggleDimension,
  onDrillDown,
  pluginDescription,
}: StatusTimeWidgetProps) {
  const hiddenPrefix = `${kpi.pluginId}|`;

  return (
    <WidgetCard
      pluginId={kpi.pluginId}
      titleContent={
        <>
          <Timer className="h-5 w-5 text-blue-400" />Turnaround Time by Status
        </>
      }
      pluginDescription={pluginDescription}
      isExpanded={isExpanded}
      onToggleCollapse={onToggleCollapse}
      hiddenDimensions={hiddenDimensions}
      hiddenPrefix={hiddenPrefix}
      onRestoreAll={onRestoreAll}
      restoreAllClassName="text-blue-400 hover:text-blue-500 hover:bg-blue-500/10"
    >
      {!kpi.results || kpi.results.length === 0 ? (
        <div className="text-center py-8 text-slate-400 dark:text-slate-600">
          <Timer className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No turnaround time data available</p>
          <p className="text-xs mt-1">This plugin requires resolved tickets with status transitions.</p>
        </div>
      ) : (
        <>
          {(() => {
            const maxValue = Math.max(...kpi.results.map(r => r.value), 1);
            return (
              <div className="space-y-3">{kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                const dimKey = `${kpi.pluginId}|${result.dimensions?.status || result.name}`;
                if (hiddenDimensions.has(dimKey)) return null;

                return (
                  <div key={idx} className="space-y-1 group">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span
                          className="text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                          onClick={() => onDrillDown(result.ticketKeys || [], result.name)}
                        >
                          {result.name}
                        </span>
                        <button
                          onClick={() => onToggleDimension(kpi.pluginId, result.dimensions?.status || result.name)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                        >
                          <EyeOff className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <span className="font-mono font-semibold text-blue-400">{result.value.toFixed(1)} {result.unit}</span>
                    </div>
                    <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="absolute h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                        style={{ width: `${(result.value / maxValue) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}</div>
            );
          })()}
          {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status || r.name}`)) && (
            <div className="text-xs text-slate-400 italic">
              {Array.from(hiddenDimensions).filter(k => k.startsWith(`${kpi.pluginId}|`)).length} status(es) hidden
            </div>
          )}
        </>
      )}
    </WidgetCard>
  );
}
