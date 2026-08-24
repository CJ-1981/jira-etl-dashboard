'use client';

import { Columns, Users, ChevronUp, ChevronDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { KpiCalcResult } from '@/types/dashboard';
import type { DrillDownHandler } from './types';

export interface KanbanWidgetProps {
  kpi: KpiCalcResult;
  title: string;
  isExpanded: boolean;
  onToggleCollapse: (pluginId: string) => void;
  onDrillDown: DrillDownHandler;
}

interface AgeInfo { count: number; keys: string[] }
interface AssigneeData {
  assignee: string;
  totalTickets: number;
  allKeys: string[];
  ageBreakdown: Record<'this_week' | 'last_week' | 'existing', AgeInfo>;
}

/**
 * Kanban widget (component type `kanban`). Groups results by status
 * (columns), then assignee (cards) with an age breakdown. Uses bespoke card
 * chrome — no shared WidgetCard.
 */
export function KanbanWidget({
  kpi,
  title,
  isExpanded,
  onToggleCollapse,
  onDrillDown,
}: KanbanWidgetProps) {
  const statusMap: Record<string, Record<string, AssigneeData>> = {};
  let totalKanbanTickets = 0;

  kpi.results.forEach((res: any) => {
    const status = res.dimensions?.status || 'Unknown';
    const assignee = res.dimensions?.assignee || 'Unassigned';
    const ageCategory = res.dimensions?.ageCategory || 'existing';
    const keys = res.ticketKeys || [];
    const val = res.value || 0;

    if (!statusMap[status]) statusMap[status] = {};
    if (!statusMap[status][assignee]) {
      statusMap[status][assignee] = {
        assignee,
        totalTickets: 0,
        allKeys: [],
        ageBreakdown: {
          this_week: { count: 0, keys: [] },
          last_week: { count: 0, keys: [] },
          existing: { count: 0, keys: [] },
        },
      };
    }

    const data = statusMap[status][assignee];
    data.totalTickets += val;
    data.allKeys.push(...keys);
    if (data.ageBreakdown[ageCategory as 'this_week' | 'last_week' | 'existing']) {
      data.ageBreakdown[ageCategory as 'this_week' | 'last_week' | 'existing'].count += val;
      data.ageBreakdown[ageCategory as 'this_week' | 'last_week' | 'existing'].keys.push(...keys);
    }

    totalKanbanTickets += val;
  });

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 overflow-hidden shadow-sm">
      <CardHeader className="bg-slate-50/50 dark:bg-slate-800/20 border-b border-slate-100 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2 text-lg font-bold">
              <Columns className="h-5 w-5 text-indigo-500" />
              {title}
            </CardTitle>
            <Badge className="bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-none font-mono text-xs">
              {totalKanbanTickets} open tickets
            </Badge>
            <button
              onClick={() => onToggleCollapse(kpi.pluginId)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 ml-1"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {/* Age Breakdown Legend */}
          {isExpanded && (
            <div className="flex items-center gap-3 text-xs text-slate-500 font-medium">
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-emerald-400 shadow-xs" />
                <span>This week</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-amber-500 shadow-xs" />
                <span>1 week old</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 rounded bg-slate-500 shadow-xs" />
                <span>2+ weeks old</span>
              </div>
            </div>
          )}
        </div>
      </CardHeader>
      {isExpanded && (
        <CardContent className="p-6">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4 overflow-x-auto pb-2">
            {Object.entries(statusMap).map(([status, assigneeObj]) => {
              const assigneeItems = Object.values(assigneeObj);
              const columnTotal = assigneeItems.reduce((sum, item) => sum + item.totalTickets, 0);
              const allStatusKeys = assigneeItems.flatMap(item => item.allKeys);

              return (
                <div key={status} className="bg-slate-100/70 dark:bg-slate-800/50 rounded-xl p-3 flex flex-col min-w-[260px] border border-slate-200/60 dark:border-slate-700/50 shadow-sm">
                  {/* Status Column Header */}
                  <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-200 dark:border-slate-700/80 px-1">
                    <span
                      className="font-bold text-sm text-slate-800 dark:text-slate-200 cursor-pointer hover:text-indigo-500 hover:underline flex items-center gap-1.5"
                      onClick={() => onDrillDown(allStatusKeys, `Status: ${status} (All Assignees)`)}
                      title="Click to drill down all tickets in this status"
                    >
                      <span className="w-2 h-2 rounded-full bg-indigo-500 inline-block shadow-xs" />
                      {status}
                    </span>
                    <Badge variant="secondary" className="bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 font-mono text-xs shadow-xs px-2 py-0.5">
                      {columnTotal}
                    </Badge>
                  </div>

                  {/* Assignee Cards List */}
                  <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[420px] pr-1">
                    {assigneeItems
                      .sort((a, b) => b.totalTickets - a.totalTickets)
                      .map((item, idx) => (
                        <div
                          key={idx}
                          className="group bg-white dark:bg-slate-900/90 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/10 p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-indigo-500/40 dark:hover:border-indigo-500/40 transition-all cursor-pointer flex flex-col gap-2.5"
                          onClick={() => onDrillDown(item.allKeys, `Assignee: ${item.assignee} (${status})`)}
                          title={`Drill down all ${item.totalTickets} ticket(s) for ${item.assignee}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <Users className="h-3.5 w-3.5 text-slate-400 group-hover:text-indigo-500 shrink-0 transition-colors" />
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 truncate">
                                {item.assignee}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {item.ageBreakdown.existing.count > 0 && (
                                <span className="text-[10px] font-mono text-slate-500 flex items-center gap-0.5 ml-0.5" title="2+ weeks old">
                                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                  {item.ageBreakdown.existing.count}
                                </span>
                              )}
                              {item.ageBreakdown.last_week.count > 0 && (
                                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 flex items-center gap-0.5 ml-0.5" title="1 week old">
                                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                                  {item.ageBreakdown.last_week.count}
                                </span>
                              )}
                              {item.ageBreakdown.this_week.count > 0 && (
                                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5 ml-0.5" title="This week">
                                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                  {item.ageBreakdown.this_week.count}
                                </span>
                              )}
                              <Badge variant="outline" className="text-[10px] ml-1 bg-slate-50 dark:bg-slate-800 font-mono group-hover:bg-indigo-100 dark:group-hover:bg-indigo-900/40 group-hover:text-indigo-600 dark:group-hover:text-indigo-300 group-hover:border-indigo-300 dark:group-hover:border-indigo-800 transition-colors" title="Total tickets">
                                {item.totalTickets}
                              </Badge>
                            </div>
                          </div>

                          {/* Segmented Age Bar */}
                          <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex gap-0.5 shadow-inner">
                            {item.ageBreakdown.existing.count > 0 && (
                              <div
                                title={`2+ weeks old: ${item.ageBreakdown.existing.count} ticket(s)`}
                                className="bg-slate-500 h-full transition-opacity hover:opacity-80"
                                style={{ width: `${(item.ageBreakdown.existing.count / item.totalTickets) * 100}%` }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDrillDown(item.ageBreakdown.existing.keys, `Assignee: ${item.assignee} (${status}) [2+ weeks]`);
                                }}
                              />
                            )}
                            {item.ageBreakdown.last_week.count > 0 && (
                              <div
                                title={`1 week old: ${item.ageBreakdown.last_week.count} ticket(s)`}
                                className="bg-amber-500 h-full transition-opacity hover:opacity-80"
                                style={{ width: `${(item.ageBreakdown.last_week.count / item.totalTickets) * 100}%` }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDrillDown(item.ageBreakdown.last_week.keys, `Assignee: ${item.assignee} (${status}) [1 week]`);
                                }}
                              />
                            )}
                            {item.ageBreakdown.this_week.count > 0 && (
                              <div
                                title={`This week: ${item.ageBreakdown.this_week.count} ticket(s)`}
                                className="bg-emerald-400 h-full transition-opacity hover:opacity-80"
                                style={{ width: `${(item.ageBreakdown.this_week.count / item.totalTickets) * 100}%` }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDrillDown(item.ageBreakdown.this_week.keys, `Assignee: ${item.assignee} (${status}) [This week]`);
                                }}
                              />
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
