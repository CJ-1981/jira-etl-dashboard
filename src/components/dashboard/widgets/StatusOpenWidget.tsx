'use client';

import { BarChart3, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import type { KpiCalcResult } from '@/types/dashboard';
import { WidgetCard } from './WidgetCard';
import type { DrillDownHandler } from './types';

// @MX:NOTE: The hidden-dimension prefix is hard-coded to the plugin id that
// produces this widget (open_tickets_by_status) — mirrored from the original
// inline implementation which never used kpi.pluginId for this case.
const STATUS_OPEN_PREFIX = 'open_tickets_by_status';

export interface StatusOpenWidgetProps {
  kpi: KpiCalcResult;
  isExpanded: boolean;
  onToggleCollapse: (pluginId: string) => void;
  hiddenDimensions: string[];
  onRestoreAll: (prefix: string) => void;
  onHideDimensions: (keys: string[]) => void;
  onDrillDown: DrillDownHandler;
  pluginDescription?: string;
}

/**
 * "Open Tickets by Status" widget (component type `status-open`).
 * Renders one stacked/segmented age bar per status with an age legend.
 */
export function StatusOpenWidget({
  kpi,
  isExpanded,
  onToggleCollapse,
  hiddenDimensions,
  onRestoreAll,
  onHideDimensions,
  onDrillDown,
  pluginDescription,
}: StatusOpenWidgetProps) {
  const hiddenPrefix = `${STATUS_OPEN_PREFIX}|`;

  return (
    <WidgetCard
      pluginId={kpi.pluginId}
      titleContent={
        <>
          <BarChart3 className="h-5 w-5 text-emerald-400" />Open Tickets by Status
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
        <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Age Groups:</span>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-slate-500" />
          <span className="text-xs text-slate-600 dark:text-slate-400">2+ weeks</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-amber-500" />
          <span className="text-xs text-slate-600 dark:text-slate-400">1 week</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded bg-emerald-400" />
          <span className="text-xs text-slate-600 dark:text-slate-400">This week</span>
        </div>
      </div>

      <div className="space-y-3">
        {(() => {
          // Group results by status
          const statusGroups: Record<string, KpiCalcResult['results'][0][]> = {};

          kpi.results.forEach((result: KpiCalcResult['results'][0]) => {
            const status = result.dimensions?.status || 'Unknown';
            if (!statusGroups[status]) {
              statusGroups[status] = [];
            }
            statusGroups[status].push(result);
          });

          // Color mapping for age categories
          const ageColors: Record<string, string> = {
            'existing': 'bg-slate-500',
            'last_week': 'bg-amber-500',
            'this_week': 'bg-emerald-400',
          };

          return Object.entries(statusGroups).map(([status, results]) => {
            const visibleResults = results.filter((r) => !hiddenDimensions.includes(`open_tickets_by_status|${r.dimensions?.ageCategory ? `${status}-${r.dimensions.ageCategory}` : status}`));
            if (visibleResults.length === 0) return null;

            const totalValue = visibleResults.reduce((sum, r) => sum + r.value, 0);
            const existingCount = visibleResults.find(r => r.dimensions?.ageCategory === 'existing')?.value || 0;
            const lastWeekCount = visibleResults.find(r => r.dimensions?.ageCategory === 'last_week')?.value || 0;
            const thisWeekCount = visibleResults.find(r => r.dimensions?.ageCategory === 'this_week')?.value || 0;

            return (
              <div key={status} className="space-y-2 group">
                {/* Status Header */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline min-w-0 max-w-full break-all"
                      onClick={() => {
                        // Gather all ticket keys for this status across all age categories
                        const allTicketKeys = visibleResults.flatMap(r => r.ticketKeys || []);
                        onDrillDown(allTicketKeys, `Status: ${status} (All)`);
                      }}
                      title="Click to see all tickets for this status"
                    >
                      {status}
                    </span>
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">({totalValue} total)</span>

                    <div className="flex items-center gap-1.5 ml-2">
                      {existingCount > 0 && (
                        <Badge variant="outline" className="px-1.5 py-0 h-4.5 bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/30 gap-1 text-[11px] font-mono font-medium" title="2+ weeks old">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                          <span>{existingCount}</span>
                        </Badge>
                      )}
                      {lastWeekCount > 0 && (
                        <Badge variant="outline" className="px-1.5 py-0 h-4.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 text-[11px] font-mono font-medium" title="1 week old">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                          <span>{lastWeekCount}</span>
                        </Badge>
                      )}
                      {thisWeekCount > 0 && (
                        <Badge variant="outline" className="px-1.5 py-0 h-4.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1 text-[11px] font-mono font-medium" title="This week">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          <span>{thisWeekCount}</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      // Hide all age categories for this status
                      const dimsToAdd = [`open_tickets_by_status|${status}-existing`, `open_tickets_by_status|${status}-last_week`, `open_tickets_by_status|${status}-this_week`];
                      onHideDimensions(dimsToAdd);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                    title="Hide this status"
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
                        const ageLabel = ageCategory === 'existing' ? '2+ weeks' : ageCategory === 'last_week' ? '1 week' : 'This week';

                        return (
                          <div
                            key={idx}
                            className={`${colorClass} hover:opacity-85 transition-opacity cursor-pointer flex items-center justify-center text-xs font-bold text-white select-none overflow-hidden`}
                            style={{ width: `${width}%` }}
                            onClick={() => onDrillDown(result.ticketKeys || [], `${status} (${result.dimensions?.ageCategory})`)}
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
        })()}
      </div>
      {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.includes(`open_tickets_by_status|${r.dimensions?.ageCategory ? `${r.dimensions?.status}-${r.dimensions.ageCategory}` : r.dimensions?.status || r.name}`)) && (
        <div className="text-xs text-slate-400 italic">
          {hiddenDimensions.filter(k => k.startsWith('open_tickets_by_status|')).length} age category(es) hidden
        </div>
      )}
    </WidgetCard>
  );
}
