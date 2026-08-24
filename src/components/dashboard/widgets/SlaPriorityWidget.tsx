'use client';

import { Target, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { KpiCalcResult } from '@/types/dashboard';
import { WidgetCard } from './WidgetCard';
import type { DrillDownHandler } from './types';

export interface SlaPriorityWidgetProps {
  kpi: KpiCalcResult;
  isExpanded: boolean;
  onToggleCollapse: (pluginId: string) => void;
  hiddenDimensions: string[];
  onRestoreAll: (prefix: string) => void;
  onToggleDimension: (pluginId: string, value: string) => void;
  onDrillDown: DrillDownHandler;
  pluginDescription?: string;
}

/**
 * "SLA by Priority" widget (component type `sla-priority`,
 * plugin `sla_by_priority`). Renders one bar per priority against its target.
 */
export function SlaPriorityWidget({
  kpi,
  isExpanded,
  onToggleCollapse,
  hiddenDimensions,
  onRestoreAll,
  onToggleDimension,
  onDrillDown,
  pluginDescription,
}: SlaPriorityWidgetProps) {
  const hiddenPrefix = kpi.pluginId + '|';

  return (
    <WidgetCard
      pluginId={kpi.pluginId}
      titleContent={
        <>
          <Target className="h-5 w-5 text-amber-400" />SLA by Priority
        </>
      }
      pluginDescription={pluginDescription}
      isExpanded={isExpanded}
      onToggleCollapse={onToggleCollapse}
      hiddenDimensions={hiddenDimensions}
      hiddenPrefix={hiddenPrefix}
      onRestoreAll={onRestoreAll}
      restoreAllClassName="text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10"
    >
      <div className="space-y-3">
        {kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
          const dimKey = `${kpi.pluginId}|${result.dimensions?.priority || result.name}`;
          if (hiddenDimensions.includes(dimKey)) return null;

          const priority = result.dimensions?.priority || result.name;
          const priorityColor: Record<string, string> = {
            'Highest': 'bg-red-500',
            'High': 'bg-orange-500',
            'Medium': 'bg-amber-500',
            'Low': 'bg-blue-500',
            'Lowest': 'bg-cyan-500',
          };

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
                  <Badge className="text-[9px] py-0 h-3.5 px-1.5 border border-slate-300 dark:border-slate-600">
                    {result.comparison?.label || 'No Target'}
                  </Badge>
                  <button
                    onClick={() => onToggleDimension(kpi.pluginId, result.dimensions?.priority || result.name)}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
                <span className="text-slate-500 dark:text-slate-400 text-xs">{result.value} {result.unit}</span>
              </div>
              <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="absolute h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-300"
                  style={{ width: `${(result.value / Math.max(result.value, result.comparison?.value || 1)) * 100}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-500 text-center">{result.value}h vs {result.comparison?.value || 'N/A'}h target</div>
            </div>
          );
        })}
      </div>
      {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.includes(`${kpi.pluginId}|${r.dimensions?.priority || r.name}`)) && (
        <div className="text-xs text-slate-400 italic">
          {hiddenDimensions.filter(k => k.startsWith(kpi.pluginId + '|')).length} priorit(y/ies) hidden
        </div>
      )}
    </WidgetCard>
  );
}
