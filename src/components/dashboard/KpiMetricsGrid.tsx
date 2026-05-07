'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Activity, Timer, Clock, EyeOff, RotateCw, Target, UserCheck, BarChart3, Plus, Download } from 'lucide-react';
import { KpiCard } from './widgets/KpiCard';
import { ChartCard } from './widgets/ChartCard';
import { KpiDataTable } from './KpiDataTable';
import { KpiErrorBoundary } from './KpiErrorBoundary';
import { KpiCalcResult, ChartConfig } from '@/types/dashboard';

interface KpiMetricsGridProps {
  kpiResults: KpiCalcResult[];
  mainKpis: KpiCalcResult[];
  statusKpis: KpiCalcResult[];
  distributionKpis: KpiCalcResult[];
  priorityKpis: KpiCalcResult[];
  slaStatusKpis: KpiCalcResult[];
  assigneeKpis: KpiCalcResult[];
  tableKpiResults: KpiCalcResult[];
  viewMode: 'grid' | 'table';
  setViewMode: (mode: 'grid' | 'table') => void;
  handleExportKpis: () => void;
  hiddenDimensions: Set<string>;
  setHiddenDimensions: any;
  toggleDimension: (pluginId: string, value: string) => void;
  handleDrillDown: (keys: string[], title: string) => void;
  charts: ChartConfig[];
  handleAddChart: () => void;
  handleRemoveChart: (id: string) => void;
  handleUpdateChart: (id: string, newConfig: ChartConfig) => void;
  handleMoveChart: (id: string, direction: 'up' | 'down') => void;
  theme: 'light' | 'dark';
  calculating: boolean;
}

export function KpiMetricsGrid(props: KpiMetricsGridProps) {
  const {
    kpiResults, mainKpis, statusKpis, distributionKpis, priorityKpis, slaStatusKpis, assigneeKpis,
    tableKpiResults, viewMode, setViewMode, handleExportKpis, hiddenDimensions, setHiddenDimensions,
    toggleDimension, handleDrillDown, charts, handleAddChart, handleRemoveChart, handleUpdateChart,
    handleMoveChart, theme, calculating
  } = props;

  if (kpiResults.length === 0 && !calculating) {
    return (
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
        <CardContent className="py-16 text-center text-slate-400 dark:text-slate-500">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-lg font-medium">No KPI results yet</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-500" />
            Metrics Overview
          </h3>

          <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className={`h-7 px-3 text-[11px] uppercase tracking-wider font-semibold transition-all ${viewMode === 'grid' ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Grid View
            </Button>
            <Button
              variant={viewMode === 'table' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('table')}
              className={`h-7 px-3 text-[11px] uppercase tracking-wider font-semibold transition-all ${viewMode === 'table' ? 'bg-white text-emerald-700 shadow-sm dark:bg-slate-700 dark:text-emerald-300' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
            >
              Table View
            </Button>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportKpis}
            className="h-8 px-3 text-[11px] uppercase tracking-wider font-semibold border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5 mr-2" />
            Export
          </Button>

          {Array.from(hiddenDimensions).some(k => mainKpis.some(mk => k === `${mk.pluginId}|`)) && (
            <Button variant="ghost" size="sm" onClick={() => {
              setHiddenDimensions((prev: Set<string>) => {
                const next = new Set(prev);
                mainKpis.forEach(mk => next.delete(`${mk.pluginId}|`));
                return next;
              });
            }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
              <RotateCw className="h-3 w-3 mr-1" /> Restore All Widgets
            </Button>
          )}
        </div>
        {viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid-3">
            {mainKpis.map((kpi) => kpi.results.map((result: any, idx: number) => {
              if (hiddenDimensions.has(`${kpi.pluginId}|`)) return null;
              return (
                <KpiErrorBoundary key={`${kpi.pluginId}-${idx}`} name={result.name}>
                  <KpiCard
                    result={result}
                    pluginId={kpi.pluginId}
                    onHide={() => toggleDimension(kpi.pluginId, '')}
                    onClick={result.ticketKeys ? () => {
                      handleDrillDown(result.ticketKeys || [], result.name);
                    } : undefined}
                  />
                </KpiErrorBoundary>
              );
            }))}
          </div>
        ) : (
          <KpiDataTable
            results={tableKpiResults}
            onDrillDown={handleDrillDown}
          />
        )}
      </div>

      {statusKpis.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5 text-blue-400" />Turnaround Time by Status</CardTitle>
              {Array.from(hiddenDimensions).some(k => k.startsWith('time_in_status|')) && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setHiddenDimensions((prev: Set<string>) => {
                    const next = new Set(prev);
                    next.forEach(k => { if (k.startsWith('time_in_status|')) next.delete(k); });
                    return next;
                  });
                }} className="h-7 text-[10px] text-blue-400 hover:text-blue-500 hover:bg-blue-500/10">
                  <RotateCw className="h-3 w-3 mr-1" /> Restore All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-4">{statusKpis.map((kpi) => {
              const visibleResults = kpi.results.filter((r: any) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status || r.name}`));
              const maxVal = Math.max(...visibleResults.map((r: any) => r.value), 1);

              return visibleResults.map((result: any, idx: number) => (
                <div key={`${kpi.pluginId}-${idx}`} className="space-y-2 group">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-slate-700 dark:text-slate-200 font-medium cursor-pointer hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline"
                        onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                      >
                        {result.name}
                      </span>
                      <button
                        onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.status || result.name)}
                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                        title="Hide item"
                      >
                        <EyeOff className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {result.value.toFixed(1)} <span className="text-xs text-slate-400">{result.unit}</span>
                    </span>
                  </div>
                  <div
                    className="h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-2 hover:ring-emerald-500/20 transition-all"
                    onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                  >
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                      style={{ width: `${(result.value / maxVal) * 100}%` }}
                    />
                  </div>
                </div>
              ));
            })}</div>
          </CardContent>
        </Card>
      )}

      {distributionKpis.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-purple-400" />
            Distribution Analysis
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {distributionKpis.map((kpi) => (
              <Card key={kpi.pluginId} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                <CardHeader>
                  <CardTitle className="text-md flex items-center gap-2">
                    <Clock className="h-4 w-4 text-purple-400" />
                    {kpi.results[0].name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {(() => {
                      let bucketOrder: string[] = [];
                      if (kpi.pluginId === 'cycle_time_histogram') {
                        bucketOrder = ['< 4h', '4-8h (1d)', '8-16h (2d)', '16-40h (1w)', '40-80h (2w)', '> 80h (2w+)'];
                      } else if (kpi.pluginId === 'aging_wip') {
                        bucketOrder = ['< 1 day', '1-3 days', '3-7 days', '1-2 weeks', '2-4 weeks', '> 4 weeks'];
                      }

                      const sortedResults = [...kpi.results].sort((a, b) => {
                        const aIdx = bucketOrder.indexOf(a.dimensions?.bucket || '');
                        const bIdx = bucketOrder.indexOf(b.dimensions?.bucket || '');
                        if (aIdx === -1 || bIdx === -1) return 0;
                        return aIdx - bIdx;
                      });

                      const maxVal = Math.max(...sortedResults.map((r: any) => r.value), 1);

                      return sortedResults.map((result: any, idx: number) => (
                        <div key={`${kpi.pluginId}-${idx}`} className="space-y-1 group">
                          <div className="flex items-center justify-between text-sm">
                            <span
                              className="text-slate-700 dark:text-slate-300 cursor-pointer hover:text-purple-500 hover:underline"
                              onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                            >
                              {result.dimensions?.bucket || result.name}
                            </span>
                            <span className="font-mono font-semibold text-purple-400">{result.value} {result.unit}</span>
                          </div>
                          <div
                            className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-1 hover:ring-purple-400 transition-all"
                            onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                          >
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-500 transition-all duration-500"
                              style={{ width: `${(result.value / maxVal) * 100}%` }}
                            />
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {priorityKpis.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-amber-400" />SLA by Priority</CardTitle>
              {Array.from(hiddenDimensions).some(k => k.startsWith('sla_by_priority|')) && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setHiddenDimensions((prev: Set<string>) => {
                    const next = new Set(prev);
                    next.forEach(k => { if (k.startsWith('sla_by_priority|')) next.delete(k); });
                    return next;
                  });
                }} className="h-7 text-[10px] text-amber-400 hover:text-amber-500 hover:bg-amber-500/10">
                  <RotateCw className="h-3 w-3 mr-1" /> Restore All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid-3">{priorityKpis.map((kpi) => kpi.results.map((result: any, idx: number) => {
              if (hiddenDimensions.has(`${kpi.pluginId}|${result.dimensions?.priority}`)) return null;
              const isClickable = result.ticketKeys && result.ticketKeys.length > 0;
              return (
                <div
                  key={`${kpi.pluginId}-${idx}`}
                  className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 relative group transition-all ${isClickable ? 'cursor-pointer hover:border-emerald-500/50 hover:shadow-sm' : ''}`}
                  onClick={isClickable ? () => handleDrillDown(result.ticketKeys || [], `${result.name} - ${result.dimensions?.priority}`) : undefined}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleDimension(kpi.pluginId, result.dimensions?.priority || ''); }}
                    className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-opacity"
                    title="Hide widget"
                  >
                    <EyeOff className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant="secondary" className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
                      {result.dimensions?.priority}
                    </Badge>
                  </div>
                  <div className={`text-3xl font-extrabold ${result.value >= 80 ? 'text-emerald-600 dark:text-emerald-400' : result.value >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                    {result.value.toFixed(1)}%
                  </div>
                  <div className="text-xs text-slate-500 mt-1 font-medium tracking-tight uppercase">SLA Compliance</div>
                </div>
              );
            }))}</div>
          </CardContent>
        </Card>
      )}

      {slaStatusKpis.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-emerald-400" />SLA by Status</CardTitle>
              {Array.from(hiddenDimensions).some(k => k.startsWith('sla_by_status|') || k.startsWith('sla_by_status_excl_clone|')) && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setHiddenDimensions((prev: Set<string>) => {
                    const next = new Set(prev);
                    next.forEach(k => { if (k.startsWith('sla_by_status|') || k.startsWith('sla_by_status_excl_clone|')) next.delete(k); });
                    return next;
                  });
                }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                  <RotateCw className="h-3 w-3 mr-1" /> Restore All
                </Button>
              )}
            </div>
            <CardDescription className="text-slate-600 dark:text-slate-400">Compliance with per-status SLA targets. Assignee comments reset the clock.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid-3">{slaStatusKpis.map((kpi) => kpi.results.map((result: any, idx: number) => {
              if (hiddenDimensions.has(`${kpi.pluginId}|${result.dimensions?.status}`)) return null;
              const isClickable = result.ticketKeys && result.ticketKeys.length > 0;
              return (
                <div
                  key={`${kpi.pluginId}-${idx}`}
                  className={`rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 relative group transition-all ${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800' : ''}`}
                  onClick={isClickable ? () => handleDrillDown(result.ticketKeys || [], `${result.name} - ${result.dimensions?.status}`) : undefined}
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleDimension(kpi.pluginId, result.dimensions?.status || ''); }}
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                    title="Hide widget"
                  >
                    <EyeOff className="h-3 w-3" />
                  </button>
                  <div className="flex items-center justify-between mb-2"><Badge variant="outline" className="text-xs">{result.dimensions?.status}</Badge><span className={`text-lg font-bold ${result.value >= 80 ? 'text-emerald-400' : result.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{result.value.toFixed(1)}%</span></div>
                  {result.details && (
                    <div className="space-y-1 mt-2">
                      <div className="flex justify-between text-xs text-slate-500"><span>Target:</span><span className="font-mono">{result.details.find((d: any) => d.label === 'Target')?.value || '-'}h</span></div>
                      <div className="flex justify-between text-xs text-slate-500"><span>Within SLA:</span><span className="font-mono">{result.details.find((d: any) => d.label === 'Within SLA')?.value || 0}/{result.details.find((d: any) => d.label === 'Total')?.value || 0}</span></div>
                    </div>
                  )}
                </div>
              );
            }))}</div>
          </CardContent>
        </Card>
      )}

      {assigneeKpis.length > 0 && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5 text-indigo-400" />Tickets by Assignee</CardTitle>
              {Array.from(hiddenDimensions).some(k => k.startsWith('open_tickets_by_assignee|')) && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setHiddenDimensions((prev: Set<string>) => {
                    const next = new Set(prev);
                    next.forEach(k => { if (k.startsWith('open_tickets_by_assignee|')) next.delete(k); });
                    return next;
                  });
                }} className="h-7 text-[10px] text-indigo-400 hover:text-indigo-500 hover:bg-indigo-500/10">
                  <RotateCw className="h-3 w-3 mr-1" /> Restore All
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">{assigneeKpis.map((kpi) => {
              const visibleResults = kpi.results.filter((r: any) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.assignee || r.name}`));
              const maxVal = Math.max(...visibleResults.map((r: any) => r.value), 1);

              return (
                <div key={kpi.pluginId} className="space-y-3">
                  {visibleResults.map((result: any, idx: number) => (
                    <div key={`${kpi.pluginId}-${idx}`} className="space-y-1 group">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <span
                            className="text-slate-700 dark:text-slate-300 font-medium cursor-pointer hover:text-blue-500 hover:underline"
                            onClick={() => handleDrillDown(result.ticketKeys || [], `${result.name} - ${result.dimensions?.assignee}`)}
                          >
                            {result.dimensions?.assignee || result.name}
                          </span>
                          <button
                            onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.assignee || result.name)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                            title="Hide bar"
                          >
                            <EyeOff className="h-3 w-3" />
                          </button>
                        </div>
                        <span className="font-mono font-bold text-indigo-400">{result.value} {result.unit}</span>
                      </div>
                      <div
                        className="h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-1 hover:ring-indigo-400 transition-all"
                        onClick={() => handleDrillDown(result.ticketKeys || [], `${result.name} - ${result.dimensions?.assignee}`)}
                      >
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-600 to-violet-500 transition-all duration-700"
                          style={{ width: `${(result.value / maxVal) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}</div>
          </CardContent>
        </Card>
      )}

      {kpiResults.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-emerald-500" />
              Visualizations
            </h3>
            {charts.length < 12 && (
              <Button
                onClick={handleAddChart}
                variant="outline"
                size="sm"
                className="border-emerald-500/30 text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Chart
              </Button>
            )}
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
                    onRemove={handleRemoveChart}
                    onChange={handleUpdateChart}
                    onMoveUp={(id) => handleMoveChart(id, 'up')}
                    onMoveDown={(id) => handleMoveChart(id, 'down')}
                    onClick={handleDrillDown}
                    theme={theme}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
