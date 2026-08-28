'use client';

import { TrendingUp, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { KpiCalcResult } from '@/types/dashboard';
import { WidgetCard } from './WidgetCard';
import type { DrillDownHandler } from './types';

export interface OtherPriorityWidgetProps {
  kpi: KpiCalcResult;
  title: string;
  isExpanded: boolean;
  onToggleCollapse: (pluginId: string) => void;
  hiddenDimensions: string[];
  onRestoreAll: (prefix: string) => void;
  onHideDimensions: (keys: string[]) => void;
  onDrillDown: DrillDownHandler;
  pluginDescription?: string;
}

/**
 * "Open Tickets by Priority" widget (component type `other-priority`,
 * e.g. `open_tickets_by_priority`). Renders one stacked/segmented age bar per
 * priority with an age legend. Closed-ticket variants relabel the legend.
 */
export function OtherPriorityWidget({
  kpi,
  title,
  isExpanded,
  onToggleCollapse,
  hiddenDimensions,
  onRestoreAll,
  onHideDimensions,
  onDrillDown,
  pluginDescription,
}: OtherPriorityWidgetProps) {
  const hiddenPrefix = kpi.pluginId + '|';

  return (
    <WidgetCard
      pluginId={kpi.pluginId}
      titleContent={
        <>
          <TrendingUp className="h-5 w-5 text-cyan-400" />
          {title}
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
      {/* Age Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
          {kpi.pluginId.includes('closed') ? 'Closed Timeframe:' : 'Age Groups:'}
        </span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-slate-500" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {kpi.pluginId.includes('closed') ? '2+ weeks ago' : '2+ weeks'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-500" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            {kpi.pluginId.includes('closed') ? 'Last week' : '1 week'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-400" />
          <span className="text-xs text-slate-600 dark:text-slate-400">
            This week
          </span>
        </div>
      </div>
      <div className="space-y-3">
        {(() => {
          // Group results by priority
          const priorityGroups: Record<string, KpiCalcResult['results'][0][]> = {};

          kpi.results.forEach((result: KpiCalcResult['results'][0]) => {
            const priority = result.dimensions?.priority || 'Unknown';
            if (!priorityGroups[priority]) {
              priorityGroups[priority] = [];
            }
            priorityGroups[priority].push(result);
          });

          // Color mapping for age categories
          const ageColors: Record<string, string> = {
            'existing': 'bg-slate-500',
            'last_week': 'bg-amber-500',
            'this_week': 'bg-emerald-400',
          };

          return Object.entries(priorityGroups).map(([priority, results]) => {
            const visibleResults = results.filter((r) => !hiddenDimensions.includes(`${kpi.pluginId}|${r.dimensions?.priority ? `${priority}-${r.dimensions.ageCategory}` : priority}`));
            if (visibleResults.length === 0) return null;

            const totalValue = visibleResults.reduce((sum, r) => sum + r.value, 0);
            const existingCount = visibleResults.find(r => r.dimensions?.ageCategory === 'existing')?.value || 0;
            const lastWeekCount = visibleResults.find(r => r.dimensions?.ageCategory === 'last_week')?.value || 0;
            const thisWeekCount = visibleResults.find(r => r.dimensions?.ageCategory === 'this_week')?.value || 0;
            const existingLabel = kpi.pluginId.includes('closed') ? '2+ weeks ago' : '2+ weeks old';
            const lastWeekLabel = kpi.pluginId.includes('closed') ? 'Last week' : '1 week old';
            const thisWeekLabel = kpi.pluginId.includes('closed') ? 'This week' : 'This week';

            return (
              <div key={priority} className="space-y-2 group">
                {/* Priority Header */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                      onClick={() => {
                        // Gather all ticket keys for this priority across all age categories
                        const allTicketKeys = visibleResults.flatMap(r => r.ticketKeys || []);
                        onDrillDown(allTicketKeys, `Priority: ${priority} (All)`);
                      }}
                      title="Click to see all tickets for this priority"
                    >
                      {priority}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">({totalValue} total)</span>

                    <div className="flex items-center gap-1.5 ml-2">
                      {existingCount > 0 && (
                        <Badge variant="outline" className="px-1.5 py-0 h-4.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30 gap-1 text-[11px] font-mono font-medium" title={existingLabel}>
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          <span>{existingCount}</span>
                        </Badge>
                      )}
                      {lastWeekCount > 0 && (
                        <Badge variant="outline" className="px-1.5 py-0 h-4.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px] font-mono font-medium" title={lastWeekLabel}>
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>{lastWeekCount}</span>
                        </Badge>
                      )}
                      {thisWeekCount > 0 && (
                        <Badge variant="outline" className="px-1.5 py-0 h-4.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px] font-mono font-medium" title={thisWeekLabel}>
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>{thisWeekCount}</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // Hide all age categories for this priority
                      const dimsToAdd = [`${kpi.pluginId}|${priority}-existing`, `${kpi.pluginId}|${priority}-last_week`, `${kpi.pluginId}|${priority}-this_week`];
                      onHideDimensions(dimsToAdd);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                    title="Hide this priority"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Stacked/Segmented Bar */}
                <div className="space-y-1">
                  <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex shadow-inner">
                    {visibleResults
                      .sort((a, b) => {
                        // Sort by age: existing → last_week → this_week
                        const ageOrder: Record<string, number> = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
                        const ageA = ageOrder[a.dimensions?.ageCategory as string] ?? 999;
                        const ageB = ageOrder[b.dimensions?.ageCategory as string] ?? 999;
                        return ageA - ageB;
                      })
                      .map((result, idx) => {
                        const width = totalValue > 0 ? (result.value / totalValue) * 100 : 0;
                        const ageCategory = result.dimensions?.ageCategory as string;
                        const colorClass = ageColors[ageCategory] || 'bg-slate-400';
                        const ageLabel = ageCategory === 'existing' ? existingLabel : ageCategory === 'last_week' ? lastWeekLabel : thisWeekLabel;

                        return (
                          <div
                            key={idx}
                            className={`${colorClass} hover:opacity-85 transition-opacity cursor-pointer flex items-center justify-center text-xs font-bold text-white select-none overflow-hidden`}
                            style={{ width: `${width}%` }}
                            onClick={() => onDrillDown(result.ticketKeys || [], `${priority} (${result.dimensions?.ageCategory})`)}
                            title={`${ageLabel}: ${result.value} ticket(s)`}
                          >
                            {result.value > 0 && width >= 6 ? result.value : null}
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            );
          });
        })()}                          </div>
      {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.includes(`${kpi.pluginId}|${r.dimensions?.priority || r.name}`)) && (
        <div className="text-xs text-slate-400 italic">
          {hiddenDimensions.filter(k => k.startsWith(kpi.pluginId + '|')).length} priorit(y/ies) hidden
        </div>
      )}
    </WidgetCard>
  );
}
