'use client';

import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  RefreshCw, Zap, Trash2, Database, Sliders, Download, Calendar, AlertTriangle, Edit2, ChevronDown
} from 'lucide-react';
import { JqlAutocomplete } from './JqlAutocomplete';
import { SavedJql, DashboardPreset } from '@/lib/config/local-store';

interface KpiDashboardToolbarProps {
  calculating: boolean;
  runCalculation: () => void;
  masterDatasetInfo: any;
  filterPanelOpen: boolean;
  setFilterPanelOpen: (open: boolean) => void;
  globalFilters: Record<string, string[]>;
  onPrint: () => void;
  periodAnalysis: {
    isAnyPresetActive: boolean;
    isDataTruncated: boolean;
    availableStartDate: string | null;
  };
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  presets: DashboardPreset[];
  handleLoadPreset: (preset: DashboardPreset) => void;
  handleUpdatePreset: (id: string, name: string) => void;
  handleDeletePreset: (id: string) => void;
  newPresetName: string;
  setNewPresetName: (name: string) => void;
  handleSavePreset: () => void;
  presetPopoverOpen: boolean;
  setPresetPopoverOpen: (open: boolean) => void;
  pendingFilters: Record<string, string[]>;
  handleUpdatePendingFilter: (key: string, value: string) => void;
  handleApplyFilters: () => void;
  jqlQuery: string;
  setJqlQuery: (query: string) => void;
  editingJqlId: string | null;
  setEditingJqlId: (id: string | null) => void;
  dashboardJqls: SavedJql[];
  jqlInputRef: React.RefObject<HTMLInputElement | null>;
  filterOptions: any;
  saveDashboardJqls: (updated: SavedJql[]) => void;
  jqlToDelete: string | null;
  setJqlToDelete: (id: string | null) => void;
}

export function KpiDashboardToolbar(props: KpiDashboardToolbarProps) {
  const {
    calculating, runCalculation, masterDatasetInfo, filterPanelOpen, setFilterPanelOpen,
    globalFilters, onPrint, periodAnalysis, dateFrom, setDateFrom, dateTo, setDateTo,
    presets, handleLoadPreset, handleUpdatePreset, handleDeletePreset,
    newPresetName, setNewPresetName, handleSavePreset, presetPopoverOpen, setPresetPopoverOpen,
    pendingFilters, handleUpdatePendingFilter, handleApplyFilters,
    jqlQuery, setJqlQuery, editingJqlId, setEditingJqlId, dashboardJqls,
    jqlInputRef, filterOptions, saveDashboardJqls, jqlToDelete, setJqlToDelete
  } = props;

  return (
    <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm overflow-visible">
      <CardHeader className="pb-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-blue-600 dark:from-emerald-400 dark:to-blue-400">
                KPI Analytics
              </CardTitle>
              <div className="flex items-center gap-1 no-print">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={runCalculation}
                  disabled={calculating}
                  className="h-6 px-2 text-[10px] text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 gap-1 rounded-md"
                >
                  <RefreshCw className={`h-3 w-3 ${calculating ? 'animate-spin' : ''}`} />
                  Recalculate
                </Button>
                <Popover open={presetPopoverOpen} onOpenChange={setPresetPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 gap-1 rounded-md"
                    >
                      <Zap className="h-3 w-3" />
                      Saved Views
                      {presets.length > 0 && <Badge className="ml-1 bg-emerald-500 hover:bg-emerald-600 border-none h-3 min-w-[12px] flex items-center justify-center p-0 text-[8px]">{presets.length}</Badge>}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0 overflow-hidden border-slate-200 dark:border-slate-800 shadow-xl z-[60]">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                      <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-1">Dashboard Presets</h4>
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">Save and recall layouts & filters</p>
                    </div>
                    <div className="p-2 max-h-[300px] overflow-y-auto">
                      {presets.length === 0 ? (
                        <div className="py-8 text-center">
                          <p className="text-xs text-slate-400 italic">No saved views yet</p>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {presets.map(p => (
                            <div key={p.id} className="group flex items-center justify-between p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer" onClick={() => handleLoadPreset(p)}>
                              <div className="flex flex-col gap-0.5">
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{p.name}</span>
                                <span className="text-[10px] text-slate-400">{new Date(p.dateFrom).toLocaleDateString()} - {new Date(p.dateTo).toLocaleDateString()}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-500"
                                      onClick={(e) => { e.stopPropagation(); handleUpdatePreset(p.id, p.name); }}
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">Update view with current settings</p>
                                  </TooltipContent>
                                </UITooltip>
                                <UITooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500"
                                      onClick={(e) => { e.stopPropagation(); handleDeletePreset(p.id); }}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">
                                    <p className="text-xs">Delete view</p>
                                  </TooltipContent>
                                </UITooltip>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-3">
                      <Label className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">Save Current View</Label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="View Name..."
                          value={newPresetName}
                          onChange={(e) => setNewPresetName(e.target.value)}
                          className="h-8 text-xs bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800"
                        />
                        <Button size="sm" className="h-8 px-3 text-xs bg-emerald-600 hover:bg-emerald-700" onClick={handleSavePreset} disabled={!newPresetName}>Save</Button>
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <CardDescription className="text-slate-600 dark:text-slate-400">
              Detailed performance metrics based on the master dataset
            </CardDescription>
            {masterDatasetInfo && (
              <div className="mt-3 flex w-fit items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 rounded-full">
                <Database className="h-3 w-3 text-blue-500" />
                <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-tight">
                  {masterDatasetInfo.dateRange?.from ? (
                    <>Data Inventory: {new Date(masterDatasetInfo.dateRange.from).toLocaleDateString()} — {new Date(masterDatasetInfo.dateRange.to || Date.now()).toLocaleDateString()}</>
                  ) : (
                    <>Data Inventory: Range Unspecified</>
                  )}
                </span>
                <span className="text-[10px] font-medium text-blue-500 dark:text-blue-400/80 border-l border-blue-200 dark:border-blue-500/30 pl-2 ml-1">
                  {masterDatasetInfo.totalExtracted.toLocaleString()} tickets • Updated {new Date(masterDatasetInfo.lastUpdated).toLocaleString(undefined, {
                    year: 'numeric', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                  })}
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFilterPanelOpen(!filterPanelOpen)}
              className={`h-9 border-slate-200 dark:border-slate-700 transition-all ${filterPanelOpen ? 'bg-slate-100 dark:bg-slate-800 ring-2 ring-emerald-500/20' : ''}`}
            >
              <Sliders className={`h-4 w-4 mr-2 ${Object.keys(globalFilters).length > 0 ? 'text-emerald-500' : ''}`} />
              Filters
              {Object.keys(globalFilters).length > 0 && (
                <Badge className="ml-2 bg-emerald-500 hover:bg-emerald-600 border-none h-5 min-w-[20px] flex items-center justify-center p-0 text-[10px]">
                  {Object.values(globalFilters).flat().length}
                </Badge>
              )}
            </Button>
            <Separator orientation="vertical" className="h-6 bg-slate-200 dark:bg-slate-800 hidden md:block" />
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-slate-500 hover:text-emerald-500 hover:bg-emerald-500/10 no-print"
              onClick={onPrint}
            >
              <Download className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Analysis Period</Label>
              {periodAnalysis.isDataTruncated && (
                <UITooltip>
                  <TooltipTrigger asChild>
                    <Badge variant="outline" className="h-4 py-0 text-[9px] border-amber-500/30 text-amber-500 gap-1 animate-pulse cursor-help">
                      <AlertTriangle className="h-2.5 w-2.5" /> Data Truncated
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs p-3 shadow-lg border-amber-200 dark:border-amber-800">
                    <p className="text-xs">
                      Your selected analysis starts on <strong className="text-amber-600 dark:text-amber-400">{new Date(dateFrom).toLocaleDateString()}</strong>, but your local dataset only contains data from <strong className="text-amber-600 dark:text-amber-400">{periodAnalysis.availableStartDate}</strong> onwards.<br /><br />
                      The charts and metrics will still render, but will only reflect the available data.
                    </p>
                  </TooltipContent>
                </UITooltip>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-3 no-print">
                <div className="flex items-center gap-2">
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                    <Input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className="h-9 pl-9 bg-gray-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-xs w-[140px] focus:ring-emerald-500/20"
                    />
                  </div>
                  <span className="text-slate-300 dark:text-slate-700">to</span>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Calendar className="h-3.5 w-3.5" />
                    </div>
                    <Input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className="h-9 pl-9 bg-gray-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-xs w-[140px] focus:ring-emerald-500/20"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-w-[300px]">
            <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold mb-2 block">Quick Presets</Label>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: '7D', days: 7 },
                { label: '14D', days: 14 },
                { label: '30D', days: 30 },
                { label: '60D', days: 60 },
                { label: '90D', days: 90 },
                { label: '180D', days: 180 },
                { label: '1Y', days: 365 },
                { label: 'MAX', days: 0 },
              ].map((p) => {
                const today = new Date();
                today.setHours(23, 59, 59, 999);

                const targetStart = new Date(today);
                targetStart.setDate(today.getDate() - p.days);
                targetStart.setHours(0, 0, 0, 0);

                const masterStart = masterDatasetInfo?.dateRange?.from ? new Date(masterDatasetInfo.dateRange.from) : null;
                let masterEnd: Date | null = null;
                if (masterDatasetInfo?.dateRange?.to) {
                  try {
                    const parsedEnd = new Date(masterDatasetInfo.dateRange.to);
                    if (!isNaN(parsedEnd.getTime())) {
                      masterEnd = parsedEnd;
                    }
                  } catch { }
                }

                const masterStartNormalized = masterStart ? new Date(masterStart) : null;
                const masterEndNormalized = masterEnd ? new Date(masterEnd) : null;
                if (masterStartNormalized) masterStartNormalized.setHours(0, 0, 0, 0);
                if (masterEndNormalized) masterEndNormalized.setHours(23, 59, 59, 999);

                const isAvailable = p.label === 'MAX' ? !!masterStartNormalized : (!masterStartNormalized || targetStart >= masterStartNormalized);

                const todayStr = today.toISOString().split('T')[0];
                const startStr = targetStart.toISOString().split('T')[0];
                const maxEndStr = masterEndNormalized ? masterEndNormalized.toISOString().split('T')[0] : todayStr;

                const isMaxActive = masterStart && dateFrom === new Date(masterStart).toISOString().split('T')[0] && dateTo === maxEndStr;
                const isActive = p.label === 'MAX' ? isMaxActive : !isMaxActive && dateTo === todayStr && dateFrom === startStr;

                return (
                  <Button
                    key={p.label}
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      if (isActive) return;
                      if (p.label === 'MAX' && masterDatasetInfo?.dateRange) {
                        setDateFrom(new Date(masterDatasetInfo.dateRange.from).toISOString().split('T')[0]);
                        setDateTo(maxEndStr);
                      } else {
                        setDateFrom(startStr);
                        setDateTo(todayStr);
                      }
                    }}
                    className={`h-8 px-3 text-[10px] font-bold transition-all ${isActive
                        ? 'bg-emerald-600 hover:bg-emerald-700 shadow-md shadow-emerald-500/20 border-transparent'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:text-emerald-500 hover:border-emerald-500/50 bg-transparent'
                      } ${!isAvailable ? 'opacity-40 cursor-not-allowed' : ''}`}
                    disabled={!isAvailable}
                  >
                    {p.label}
                  </Button>
                );
              })}
            </div>
          </div>
        </div>

        {filterPanelOpen && (
          <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4 animate-in slide-in-from-top-4 duration-300">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                <Sliders className="h-4 w-4 text-emerald-500" />
                Advanced Filtering
              </h4>
              <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-red-500" onClick={() => {
                // handleClearAll would be better but we'll use props
              }}>
                Clear All Filters
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 bg-slate-50 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">JQL-Lite Filter</Label>
                  {jqlQuery && (
                    <Badge variant="outline" className="h-4 py-0 text-[9px] border-emerald-500/30 text-emerald-500 bg-emerald-500/5">
                      <Zap className="h-2.5 w-2.5 mr-1" /> Dynamic Filter Active
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <JqlAutocomplete
                    ref={jqlInputRef}
                    value={jqlQuery}
                    onChange={setJqlQuery}
                    filterOptions={filterOptions}
                    className="flex-1"
                  />
                  <Button
                    size="sm"
                    className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-xs"
                    onClick={() => {
                      if (!jqlQuery) return;
                      if (editingJqlId) {
                        const oldJql = dashboardJqls.find(j => j.id === editingJqlId);
                        const updated = dashboardJqls.map(j => j.id === editingJqlId ? { ...j, query: jqlQuery } : j);
                        saveDashboardJqls(updated);
                        setEditingJqlId(null);
                        setJqlQuery('');
                        // handleUpdatePendingFilter('jql', oldJql?.query, jqlQuery)
                      } else {
                        const id = `djql-${Date.now()}`;
                        saveDashboardJqls([...dashboardJqls, { id, name: jqlQuery, query: jqlQuery }]);
                        setJqlQuery('');
                        handleUpdatePendingFilter('jql', jqlQuery);
                      }
                    }}
                  >
                    {editingJqlId ? 'Update' : 'Add'} Filter
                  </Button>
                </div>

                {dashboardJqls.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                    {dashboardJqls.map(djql => {
                      const isActive = pendingFilters['jql']?.includes(djql.query);
                      return (
                        <div key={djql.id} className="flex items-center gap-1">
                          <Badge
                            variant={isActive ? 'default' : 'outline'}
                            className={`h-6 px-2 gap-1.5 transition-all cursor-pointer ${isActive ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}
                            onClick={() => handleUpdatePendingFilter('jql', djql.query)}
                          >
                            <span className="max-w-[120px] truncate font-mono">{djql.query}</span>
                            <div className="flex items-center gap-1 ml-1">
                                <span className="hover:text-blue-300 transition-colors p-0.5" onClick={(e) => { e.stopPropagation(); setEditingJqlId(djql.id); setJqlQuery(djql.query); }}>
                                  <Edit2 className="h-2.5 w-2.5" />
                                </span>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <span className="hover:text-red-200 transition-colors p-0.5" onClick={(e) => e.stopPropagation()}>
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </span>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete Filter?</AlertDialogTitle>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => {
                                        const updated = dashboardJqls.filter(j => j.id !== djql.id);
                                        saveDashboardJqls(updated);
                                      }}>Delete</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                            </div>
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Project', key: 'project', options: filterOptions.project },
                  { label: 'Assignee', key: 'assignee', options: filterOptions.assignee },
                  { label: 'Priority', key: 'priority', options: filterOptions.priority },
                  { label: 'Issue Type', key: 'issueType', options: filterOptions.issueType },
                  { label: 'Status', key: 'status', options: filterOptions.status },
                  { label: 'Component', key: 'component', options: filterOptions.component },
                  { label: 'Label', key: 'label', options: filterOptions.label },
                ].filter(f => f.options.length > 1).map(filter => (
                  <div key={filter.key} className="space-y-1.5">
                    <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">{filter.label}</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full h-8 text-[11px] justify-between bg-gray-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 font-normal"
                        >
                          <span className="truncate">
                            {pendingFilters[filter.key]?.length
                              ? `${pendingFilters[filter.key].length} selected`
                              : `All ${filter.label}s`}
                          </span>
                          <ChevronDown className="h-3 w-3 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[200px] p-0" align="start">
                        <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                          {filter.options.map(opt => (
                            <div
                              key={opt}
                              className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-sm"
                              onClick={() => handleUpdatePendingFilter(filter.key, opt)}
                            >
                              <div className={`w-3 h-3 border rounded-sm flex items-center justify-center ${pendingFilters[filter.key]?.includes(opt) ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-700'}`}>
                                {pendingFilters[filter.key]?.includes(opt) && <RefreshCw className="h-2 w-2 text-white" />}
                              </div>
                              <span className="text-[11px] truncate">{opt}</span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button size="sm" className="h-8 px-6 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold" onClick={handleApplyFilters}>
                  Apply All Filters
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
