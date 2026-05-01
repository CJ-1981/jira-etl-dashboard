'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  transformForBarChart,
  transformForPieChart,
  transformForLineChart,
  getKpiOptions,
  getRecommendedChartType,
  formatChartValue,
  isTimeSeriesPlugin,
  CHART_COLORS,
} from '@/lib/chart-data-utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectGroup,
  SelectLabel,
  SelectSeparator,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Activity, Target, Timer, UserCheck, BarChart3, Clock, AlertTriangle,
  TrendingUp, Zap, Calendar, EyeOff, X, RotateCw, Plus, Trash2,
  Download, Loader2, Edit2, Ticket, ExternalLink, Sliders, CheckCircle2,
  ArrowUp, Search, ChevronDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { localConfig, type SavedJql } from '@/lib/config/local-store';
import { ChartConfig } from '@/types/dashboard';

interface KpiDashboardProps {
  connections: any[];
  extractionResult: any;
  masterDatasetInfo: any;
  setMasterDatasetInfo: (info: any) => void;
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  region: string;
  setRegion: (region: string) => void;
  activeConnectionId: string;
  settings: any;
  kpiResults: any[];
  setKpiResults: (results: any[]) => void;
  storageConfig: any;
  globalFilters: Record<string, string[]>;
  setGlobalFilters: (filters: any) => void;
  hiddenDimensions: Set<string>;
  setHiddenDimensions: (dimensions: any) => void;
  charts: ChartConfig[];
  setCharts: (charts: ChartConfig[]) => void;
  jqlQuery: string;
  setJqlQuery: (query: string) => void;
  filterPanelOpen: boolean;
  setFilterPanelOpen: (open: boolean) => void;
  theme: 'light' | 'dark';
  showFloatingBar: boolean;
  onPrint?: () => void;
}

export function KpiDashboard({
  connections, extractionResult, masterDatasetInfo, setMasterDatasetInfo, dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion, activeConnectionId, settings, kpiResults, setKpiResults, storageConfig,
  globalFilters, setGlobalFilters, hiddenDimensions, setHiddenDimensions, charts, setCharts, jqlQuery, setJqlQuery, filterPanelOpen, setFilterPanelOpen, theme, showFloatingBar, onPrint
}: KpiDashboardProps) {
  const [calculating, setCalculating] = useState(false);
  const isFirstRender = useRef(true);

  // ─── Period Analysis Helpers ──────────────────────────────────────────────
  const { isAnyPresetActive, isDataTruncated, availableStartDate } = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isToday = dateTo === todayStr;
    const fromDate = dateFrom ? new Date(dateFrom) : null;
    const toDate = dateTo ? new Date(dateTo) : null;
    const diffDays = (fromDate && toDate) ? Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)) : 0;
    
    const presets = [7, 14, 30, 60, 90, 180, 365];
    const isActive = isToday && presets.includes(diffDays);
    
    const masterStart = masterDatasetInfo?.dateRange?.from ? new Date(masterDatasetInfo.dateRange.from) : null;
    const isTruncated = masterStart && fromDate && fromDate < masterStart;
    
    return {
      isAnyPresetActive: isActive,
      isDataTruncated: !!isTruncated,
      availableStartDate: masterStart ? masterStart.toLocaleDateString() : null
    };
  }, [dateFrom, dateTo, masterDatasetInfo]);

  // JQL-Lite Filter state
  const [dashboardJqls, setDashboardJqls] = useState<SavedJql[]>([]);
  const [newJqlName, setNewJqlName] = useState('');
  const [jqlAutocompleteOpen, setJqlAutocompleteOpen] = useState(false);
  const [jqlToDelete, setJqlToDelete] = useState<string | null>(null);
  const [editingJqlId, setEditingJqlId] = useState<string | null>(null);

  // Staging filters for multi-select without instant update
  const [pendingFilters, setPendingFilters] = useState<Record<string, string[]>>(globalFilters);

  // Drill-down state
  const [drillDownKeys, setDrillDownKeys] = useState<string[] | null>(null);
  const [drillDownTitle, setDrillDownTitle] = useState('');

  // Load saved JQLs on mount
  useEffect(() => {
    setDashboardJqls(localConfig.getDashboardJqls());
  }, []);

  const saveDashboardJqls = (updated: SavedJql[]) => {
    setDashboardJqls(updated);
    localConfig.saveDashboardJqls(updated);
  };

  const handleUpdatePendingFilter = (key: string, value: string) => {
    if (value === 'all') {
      setPendingFilters(prev => ({ ...prev, [key]: [] }));
      return;
    }
    setPendingFilters(prev => {
      const current = prev[key] || [];
      if (current.includes(value)) {
        return { ...prev, [key]: current.filter(v => v !== value) };
      } else {
        return { ...prev, [key]: [...current, value] };
      }
    });
  };

  const handleApplyFilters = () => {
    setGlobalFilters(pendingFilters);
    setFilterPanelOpen(false);
    toast.success('Filters applied');
  };

  const handleUpdateFilter = (key: string, value: string) => {
    const updated = { ...globalFilters };
    if (updated[key]) {
      updated[key] = updated[key].filter(v => v !== value);
      if (updated[key].length === 0) delete updated[key];
      setGlobalFilters(updated);
      setPendingFilters(updated);
    }
  };

  const toggleDimension = (pluginId: string, value: string) => {
    setHiddenDimensions((prev: Set<string>) => {
      const next = new Set(prev);
      const key = `${pluginId}|${value}`;
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleAddChart = () => {
    const id = `chart-${Date.now()}`;
    setCharts([...charts, { id, kpiId: '', type: 'bar', width: 'md' }]);
  };

  const handleRemoveChart = (id: string) => {
    setCharts(charts.filter(c => c.id !== id));
  };

  const handleUpdateChart = (id: string, newConfig: ChartConfig) => {
    setCharts(charts.map(c => c.id === id ? newConfig : c));
  };

  const handleDrillDown = (keys: string[], title: string) => {
    setDrillDownKeys(keys);
    setDrillDownTitle(title);
  };

  const runCalculation = useCallback(async () => {
    if (!activeConnectionId) return;
    setCalculating(true);
    // setKpiResults([]); // Keep existing results while calculating for better UX
    try {
      const res = await fetch('/api/kpi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: activeConnectionId,
          issues: masterDatasetInfo?.issues || [],
          dateFrom,
          dateTo,
          region,
          filters: globalFilters,
          settings,
          storageConfig
        })
      });
      const data = await res.json();
      if (data.success) {
        const processedResults = data.results.map((r: any) => ({
          ...r,
          results: r.results.map((res: any) => ({
            ...res,
            unit: res.unit || '',
            value: typeof res.value === 'number' ? res.value : 0
          }))
        }));
        setKpiResults(processedResults);
      } else {
        toast.error(data.error || 'Calculation failed');
      }
    } catch (err) {
      console.error('Calculation error:', err);
      toast.error('Failed to calculate KPIs');
    } finally {
      setCalculating(false);
    }
  }, [activeConnectionId, dateFrom, dateTo, globalFilters, region, settings, storageConfig, setKpiResults, masterDatasetInfo]);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (kpiResults.length === 0) runCalculation();
    } else {
      runCalculation();
    }
  }, [runCalculation]);

  const mainKpis = kpiResults.filter((r: any) => !r.results[0]?.dimensions?.status && !r.results[0]?.dimensions?.priority && !r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  const assigneeKpis = kpiResults.filter((r: any) => r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  const statusKpis = kpiResults.filter((r: any) => r.results[0]?.dimensions?.status && r.pluginId === 'time_in_status' && !isTimeSeriesPlugin(r.pluginId));
  const slaStatusKpis = kpiResults.filter((r: any) => r.results[0]?.dimensions?.status && (r.pluginId === 'sla_by_status' || r.pluginId === 'sla_by_status_excl_clone') && !isTimeSeriesPlugin(r.pluginId));
  const priorityKpis = kpiResults.filter((r: any) => r.results[0]?.dimensions?.priority && !isTimeSeriesPlugin(r.pluginId));
  const timeSeriesKpis = kpiResults.filter((r: any) => isTimeSeriesPlugin(r.pluginId));

  const filterOptions = useMemo(() => {
    const options = { project: new Set<string>(), assignee: new Set<string>(), priority: new Set<string>(), issueType: new Set<string>(), status: new Set<string>(), component: new Set<string>(), label: new Set<string>() };
    if (masterDatasetInfo?.issues) {
      masterDatasetInfo.issues.forEach((i: any) => {
        const f = i.fields || {};
        if (f.project?.name) options.project.add(f.project.name);
        if (f.assignee?.displayName) options.assignee.add(f.assignee.displayName);
        if (f.priority?.name) options.priority.add(f.priority.name);
        if (f.issuetype?.name) options.issueType.add(f.issuetype.name);
        if (f.status?.name) options.status.add(f.status.name);
        if (f.components) f.components.forEach((c: any) => options.component.add(c.name));
        if (f.labels) f.labels.forEach((l: any) => options.label.add(l));
      });
    }
    return { project: Array.from(options.project).sort(), assignee: Array.from(options.assignee).sort(), priority: Array.from(options.priority).sort(), issueType: Array.from(options.issueType).sort(), status: Array.from(options.status).sort(), component: Array.from(options.component).sort(), label: Array.from(options.label).sort() };
  }, [masterDatasetInfo]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 shadow-sm overflow-visible">
        <CardHeader className="pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-blue-600 dark:from-emerald-400 dark:to-blue-400">
                KPI Analytics
              </CardTitle>
              <CardDescription className="text-slate-600 dark:text-slate-400">
                Detailed performance metrics based on the master dataset
              </CardDescription>
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
                Export / Print
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Analysis Period</Label>
                {isDataTruncated && (
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="h-4 py-0 text-[9px] border-amber-500/30 text-amber-500 gap-1 animate-pulse cursor-help">
                        <AlertTriangle className="h-2.5 w-2.5" /> Data Truncated
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-3">
                      <p className="text-xs">Your selected start date ({new Date(dateFrom).toLocaleDateString()}) is earlier than your local data availability ({availableStartDate}). Results only reflect available data.</p>
                    </TooltipContent>
                  </UITooltip>
                )}
              </div>
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

            <div className="flex-none pb-0.5">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => runCalculation()} 
                disabled={calculating || !activeConnectionId}
                className="h-9 px-3 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-emerald-500 hover:border-emerald-500/50 transition-all shadow-sm bg-white dark:bg-slate-900/50"
              >
                {calculating ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <RotateCw className="h-4 w-4 mr-2" />
                )}
                Recalculate
              </Button>
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
                ].map((p) => {
                  const today = new Date();
                  const targetStart = new Date();
                  targetStart.setDate(today.getDate() - p.days);
                  const masterStart = masterDatasetInfo?.dateRange?.from ? new Date(masterDatasetInfo.dateRange.from) : null;
                  const isAvailable = !masterStart || targetStart >= masterStart;
                  
                  const todayStr = today.toISOString().split('T')[0];
                  const startStr = targetStart.toISOString().split('T')[0];
                  const isActive = dateTo === todayStr && dateFrom === startStr;

                  return (
                    <Button
                      key={p.label}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        setDateFrom(startStr);
                        setDateTo(todayStr);
                      }}
                      className={`h-8 px-3 text-[10px] font-bold transition-all ${
                        isActive 
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

            {calculating && (
              <div className="flex items-center gap-2 text-emerald-500 animate-pulse pb-2 px-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-xs font-bold uppercase tracking-widest">Calculating...</span>
              </div>
            )}
          </div>

          {filterPanelOpen && (
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4 animate-in slide-in-from-top-4 duration-300">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold flex items-center gap-2 text-slate-700 dark:text-slate-300">
                  <Sliders className="h-4 w-4 text-emerald-500" />
                  Advanced Filtering
                </h4>
                <Button variant="ghost" size="sm" className="h-7 text-xs text-slate-400 hover:text-red-500" onClick={() => {
                  setPendingFilters({});
                  setGlobalFilters({});
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
                    <div className="relative flex-1 group">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
                      <Input 
                        placeholder="Filter by JQL (e.g. status = Done AND priority = High)..." 
                        value={jqlQuery}
                        onChange={(e) => setJqlQuery(e.target.value)}
                        className="h-9 pl-9 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs focus:ring-emerald-500/20"
                      />
                    </div>
                    <Button 
                      size="sm" 
                      className="h-9 px-3 bg-blue-600 hover:bg-blue-700 text-xs"
                      onClick={() => {
                        if (!jqlQuery) return;
                        if (editingJqlId) {
                          const updated = dashboardJqls.map(j => j.id === editingJqlId ? { ...j, query: jqlQuery } : j);
                          saveDashboardJqls(updated);
                          setEditingJqlId(null);
                          toast.success('Filter updated');
                        } else {
                          const id = `djql-${Date.now()}`;
                          saveDashboardJqls([...dashboardJqls, { id, name: jqlQuery, query: jqlQuery }]);
                          toast.success('Filter saved to dashboard');
                        }
                        handleUpdatePendingFilter('jql', jqlQuery);
                      }}
                    >
                      {editingJqlId ? 'Update' : 'Add'} Filter
                    </Button>
                    {editingJqlId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-[10px]"
                        onClick={() => {
                          setEditingJqlId(null);
                          setJqlQuery('');
                        }}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>

                  {dashboardJqls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {dashboardJqls.map(djql => {
                        const isActive = pendingFilters['jql']?.includes(djql.query);
                        const isEditing = editingJqlId === djql.id;
                        return (
                          <div key={djql.id} className="flex items-center gap-1">
                            <Badge 
                              variant={isActive ? 'default' : 'outline'}
                              className={`h-6 px-2 gap-1.5 transition-all cursor-pointer ${isEditing ? 'ring-2 ring-amber-500' : ''} ${isActive ? 'bg-blue-600 hover:bg-blue-700' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500'}`}
                              onClick={() => handleUpdatePendingFilter('jql', djql.query)}
                            >
                              <span className="max-w-[120px] truncate font-mono">{djql.query}</span>
                              <div className="flex items-center gap-1 ml-1">
                                <span 
                                  className="hover:text-blue-300 transition-colors p-0.5"
                                  onClick={(e) => { 
                                    e.stopPropagation(); 
                                    setEditingJqlId(djql.id);
                                    setJqlQuery(djql.query);
                                  }}
                                >
                                  <Edit2 className="h-2.5 w-2.5" />
                                </span>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <span 
                                      className="hover:text-red-200 transition-colors p-0.5"
                                      onClick={(e) => { e.stopPropagation(); setJqlToDelete(djql.id); }}
                                    >
                                      <Trash2 className="h-2.5 w-2.5" />
                                    </span>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Delete JQL-Lite Filter?</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to delete this saved filter? This action cannot be undone.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel onClick={() => setJqlToDelete(null)}>Cancel</AlertDialogCancel>
                                      <AlertDialogAction 
                                        className="bg-red-600 hover:bg-red-700"
                                        onClick={() => {
                                          if (jqlToDelete) {
                                            const updated = dashboardJqls.filter(j => j.id !== jqlToDelete);
                                            saveDashboardJqls(updated);
                                            const queryToDelete = dashboardJqls.find(j => j.id === jqlToDelete)?.query;
                                            if (queryToDelete && pendingFilters['jql']?.includes(queryToDelete)) {
                                              handleUpdatePendingFilter('jql', queryToDelete);
                                            }
                                            if (editingJqlId === jqlToDelete) {
                                              setEditingJqlId(null);
                                              setJqlQuery('');
                                            }
                                            setJqlToDelete(null);
                                            toast.success('Filter deleted');
                                          }
                                        }}
                                      >
                                        Delete
                                      </AlertDialogAction>
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

                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 no-print">
                {[
                  { label: 'Project', key: 'project', options: filterOptions.project },
                  { label: 'Assignee', key: 'assignee', options: filterOptions.assignee },
                  { label: 'Priority', key: 'priority', options: filterOptions.priority },
                  { label: 'Issue Type', key: 'issueType', options: filterOptions.issueType },
                  { label: 'Status', key: 'status', options: filterOptions.status },
                  { label: 'Component', key: 'component', options: filterOptions.component },
                  { label: 'Label', key: 'label', options: filterOptions.label },
                ].filter(f => f.options.length > 1).map(filter => (
                  <div key={filter.key} className="space-y-1.5 no-print">
                    <Label className="text-[10px] uppercase tracking-wider text-slate-400 font-bold no-print">{filter.label}</Label>
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
                        <div className="p-2 border-b border-slate-100 dark:border-slate-800">
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="w-full h-7 text-[10px] justify-start px-2"
                            onClick={() => handleUpdatePendingFilter(filter.key, 'all')}
                          >
                            Clear All
                          </Button>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto p-1 custom-scrollbar">
                          {filter.options.map(opt => (
                            <div 
                              key={opt} 
                              className="flex items-center gap-2 px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer rounded-sm" 
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                handleUpdatePendingFilter(filter.key, opt); 
                              }}
                            >
                              <Checkbox checked={!!pendingFilters[filter.key]?.includes(opt)} onCheckedChange={() => {}} />
                              <span className="text-xs truncate">{opt}</span>
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                ))}
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-100 dark:border-slate-800 no-print">
                  <Button 
                    size="sm" 
                    onClick={handleApplyFilters} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-xs gap-2"
                    disabled={JSON.stringify(globalFilters) === JSON.stringify(pendingFilters)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Apply Filters
                  </Button>
                </div>
              </div>

              {Object.keys(globalFilters).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(Object.entries(globalFilters) as [string, string[]][]).map(([key, values]) => (
                    values.map(val => (
                      <Badge key={`${key}-${val}`} variant="outline" className="gap-1 px-1.5 py-0 h-5 text-[10px] bg-slate-50 dark:bg-slate-800/50 text-slate-600 border-slate-200">
                        <span className="text-slate-400">{key}:</span> {val}
                        <span 
                          className="flex items-center justify-center pointer-events-auto cursor-pointer hover:text-red-500 transition-colors"
                          onClick={(e) => { e.stopPropagation(); handleUpdateFilter(key, val); }}
                        >
                          <X className="h-2.5 w-2.5" />
                        </span>
                      </Badge>
                    ))
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {kpiResults.length > 0 && (<>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-500" />
              Overview
            </h3>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid-3">
            {mainKpis.map((kpi) => kpi.results.map((result: any, idx: number) => {
              if (hiddenDimensions.has(`${kpi.pluginId}|`)) return null;
              return (
                <KpiCard 
                  key={`${kpi.pluginId}-${idx}`} 
                  result={result} 
                  pluginId={kpi.pluginId} 
                  onHide={() => toggleDimension(kpi.pluginId, '')}
                  onClick={result.ticketKeys ? () => {
                    handleDrillDown(result.ticketKeys || [], result.name);
                  } : undefined}
                />
              );
            }))}
          </div>
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
                      next.forEach(k => { if(k.startsWith('time_in_status|')) next.delete(k); });
                      return next;
                    });
                  }} className="h-7 text-[10px] text-blue-400 hover:text-blue-500 hover:bg-blue-500/10">
                    <RotateCw className="h-3 w-3 mr-1" /> Restore All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">{statusKpis.map((kpi) => {
                const visibleResults = kpi.results.filter((r: any) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status || r.name}`));
                const maxVal = Math.max(...visibleResults.map((r: any) => r.value), 1);
                
                return visibleResults.map((result: any, idx: number) => (
                  <div key={`${kpi.pluginId}-${idx}`} className="space-y-1 group">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span 
                          className="text-slate-700 dark:text-slate-300 cursor-pointer hover:text-blue-500 hover:underline"
                          onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                        >
                          {result.name}
                        </span>
                        <button 
                          onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.status || result.name)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                          title="Hide bar"
                        >
                          <EyeOff className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="font-mono font-semibold text-blue-400">{result.value.toFixed(1)} {result.unit}</span>
                    </div>
                    <div 
                      className="h-2 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-1 hover:ring-blue-400 transition-all"
                      onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                    >
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-all duration-500" 
                        style={{ width: `${(result.value / maxVal) * 100}%` }} 
                      />
                    </div>
                  </div>
                ));
              })}</div>
            </CardContent>
          </Card>
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
                      next.forEach(k => { if(k.startsWith('sla_by_priority|')) next.delete(k); });
                      return next;
                    });
                  }} className="h-7 text-[10px] text-amber-400 hover:text-amber-500 hover:bg-amber-500/10">
                    <RotateCw className="h-3 w-3 mr-1" /> Restore All
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid-3">{priorityKpis.map((kpi) => kpi.results.map((result: any, idx: number) => {
                if (hiddenDimensions.has(`${kpi.pluginId}|${result.dimensions?.priority}`)) return null;
                const isClickable = result.ticketKeys && result.ticketKeys.length > 0;
                return (
                  <div 
                    key={`${kpi.pluginId}-${idx}`} 
                    className={`rounded-lg bg-gray-50 dark:bg-slate-800/50 p-4 relative group transition-all ${isClickable ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-800' : ''}`}
                    onClick={isClickable ? () => handleDrillDown(result.ticketKeys || [], `${result.name} - ${result.dimensions?.priority}`) : undefined}
                  >
                    <button 
                      onClick={(e) => { e.stopPropagation(); toggleDimension(kpi.pluginId, result.dimensions?.priority || ''); }}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                      title="Hide widget"
                    >
                      <EyeOff className="h-3 w-3" />
                    </button>
                    <div className="flex items-center justify-between mb-2"><Badge variant="outline" className="text-xs">{result.dimensions?.priority}</Badge><span className={`text-lg font-bold ${result.value >= 80 ? 'text-emerald-400' : result.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{result.value.toFixed(1)}%</span></div>
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
                      next.forEach(k => { if(k.startsWith('sla_by_status|') || k.startsWith('sla_by_status_excl_clone|')) next.delete(k); });
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
                      next.forEach(k => { if(k.startsWith('open_tickets_by_assignee|')) next.delete(k); });
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

        {/* Chart Section */}
        {kpiResults.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-emerald-500" />
                Visualizations
              </h3>
              {charts.length < 6 && (
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
                      onClick={handleDrillDown}
                      theme={theme}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </>)}
      {kpiResults.length === 0 && !calculating && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardContent className="py-16 text-center text-slate-400 dark:text-slate-500"><BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-medium">No KPI results yet</p></CardContent></Card>
      )}

      {/* Drill-down Sheet */}
      <Sheet open={!!drillDownKeys} onOpenChange={(open) => !open && setDrillDownKeys(null)}>
        <SheetContent side="right" className="w-[90%] sm:w-[540px] border-l-slate-200 dark:border-l-slate-800 p-0 overflow-hidden flex flex-col">
          <SheetHeader className="p-6 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <SheetTitle className="flex items-center gap-2 text-xl">
              <Ticket className="h-5 w-5 text-blue-500" />
              {drillDownTitle}
            </SheetTitle>
            <SheetDescription>
              Displaying {(drillDownKeys as any)?.length || 0} issues comprising this metric
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            <div className="space-y-3">
              {drillDownKeys && drillDownKeys.map(key => {
                const issue = (masterDatasetInfo?.issues || []).find((i: any) => i.key === key);
                if (!issue) return null;
                
                const activeConnection = connections.find((c: any) => c.id === activeConnectionId);
                const baseUrl = activeConnection?.baseUrl || '';
                const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                return (
                  <div key={key} className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 group hover:border-blue-500/30 transition-all">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <a href={jiraUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-mono font-bold text-blue-500 hover:underline flex items-center gap-1">
                        {key} <ExternalLink className="h-3 w-3" />
                      </a>
                      <Badge variant="outline" className="text-[10px] h-4 py-0">{issue.fields?.status?.name || issue.status}</Badge>
                    </div>
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200 line-clamp-2 mb-2">{issue.fields?.summary || issue.summary}</p>
                    <div className="flex items-center gap-4 text-[10px] text-slate-500">
                      <div className="flex items-center gap-1"><UserCheck className="h-3 w-3" /> {issue.fields?.assignee?.displayName || issue.assignee || 'Unassigned'}</div>
                      <div className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(issue.fields?.created || issue.created).toLocaleDateString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AnimatePresence>
        {showFloatingBar && (
          <motion.div
            initial={{ y: -100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -100, opacity: 0 }}
            className="fixed top-[61px] left-1/2 -translate-x-1/2 z-[60] w-full max-w-xl px-4"
          >
            <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-full shadow-2xl p-1.5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 px-3">
                <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <Calendar className="h-3.5 w-3.5 text-emerald-500" />
                  {dateFrom && dateTo ? `${new Date(dateFrom).toLocaleDateString()} - ${new Date(dateTo).toLocaleDateString()}` : 'No Period'}
                </div>
                <Separator orientation="vertical" className="h-4 bg-slate-200 dark:bg-slate-800" />
                <TooltipProvider delayDuration={0}>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-help">
                        <Sliders className="h-3.5 w-3.5 text-emerald-500" />
                        {Object.values(globalFilters).flat().length} Filters
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-2xl max-w-xs z-[70]">
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Applied Filters</p>
                        {Object.keys(globalFilters).length > 0 ? (
                          <div className="space-y-2">
                            {(Object.entries(globalFilters) as [string, string[]][]).map(([key, values]) => (
                              <div key={key} className="flex flex-col gap-0.5">
                                <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-tight">{key}</span>
                                <div className="flex flex-wrap gap-1">
                                  {values.map(v => (
                                    <Badge key={v} variant="secondary" className="text-[10px] py-0 h-4 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-none">
                                      {v}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No active filters</p>
                        )}
                      </div>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-2">
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={() => runCalculation()} 
                  disabled={calculating}
                  className="rounded-full h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-xs px-3 transition-all"
                >
                  {calculating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  Recalculate
                </Button>
                <Button 
                  size="sm" 
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} 
                  className="rounded-full h-8 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs px-3 border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  <ArrowUp className="h-3.5 w-3.5 mr-1.5" />
                  Top
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({ result, pluginId, onHide, onClick }: { 
  result: { 
    name: string; 
    value: number; 
    unit: string; 
    dimensions?: any; 
    details?: Array<{ label: string; value: number; unit?: string }>;
    ticketKeys?: string[];
    comparison?: { value: number; change: number; label: string };
  }; 
  pluginId: string; 
  onHide?: () => void;
  onClick?: () => void;
}) {
  const getIcon = () => {
    if (result.name.includes('Processing')) return <Clock className="h-5 w-5" />;
    if (result.name.includes('Working Days')) return <Calendar className="h-5 w-5" />;
    if (result.name.includes('SLA')) return <Target className="h-5 w-5" />;
    if (result.name.includes('Throughput')) return <TrendingUp className="h-5 w-5" />;
    if (result.name.includes('Resolution')) return <CheckCircle2 className="h-5 w-5" />;
    if (result.name.includes('Reassign')) return <AlertTriangle className="h-5 w-5" />;
    return <Zap className="h-5 w-5" />;
  };
  const getColor = () => {
    if (result.unit === '%') { if (result.value >= 80) return 'text-emerald-400'; if (result.value >= 50) return 'text-amber-400'; return 'text-red-400'; }
    if (result.unit === 'hours') { if (result.value <= 40) return 'text-emerald-400'; if (result.value <= 80) return 'text-amber-400'; return 'text-red-400'; }
    return 'text-blue-400';
  };

  const isClickable = !!onClick || (result.ticketKeys && result.ticketKeys.length > 0);

  return (
    <Card 
      className={`border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-slate-200 dark:border-slate-700 transition-colors group relative ${isClickable ? 'cursor-pointer hover:shadow-md' : ''}`}
      onClick={isClickable ? onClick : undefined}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <p className={`text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 ${isClickable ? 'group-hover:text-blue-500 group-hover:underline' : ''}`}>
            {result.name}
          </p>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px] text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-800">
              {pluginId.split('_').slice(0, 2).join(' ')}
            </Badge>
            {onHide && (
              <button
                onClick={(e) => { e.stopPropagation(); onHide(); }}
                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity p-0.5"
                title="Hide widget"
              >
                <EyeOff className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3">
          <div className="rounded-lg p-2 bg-gray-100 dark:bg-slate-800/50">
            <div className={getColor()}>{getIcon()}</div>
          </div>
          <div className="flex items-baseline gap-1.5">
            <p className={`text-3xl font-bold font-mono tracking-tight ${getColor()}`}>
              {result.value % 1 !== 0 ? result.value.toFixed(2) : result.value}
            </p>
            {result.unit && <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">{result.unit}</p>}
          </div>
        </div>

        <div className="flex items-center justify-between mb-1">
          {result.ticketKeys && result.ticketKeys.length > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[9px] bg-slate-100 dark:bg-slate-800 text-slate-400 border-none">
              {result.ticketKeys.length} tickets
            </Badge>
          )}
        </div>
        {/* Weekly Breakdown Section */}
        {result.details && result.details.some((d: any) => ['This Week', 'Previous Week'].includes(d.label)) && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
            {result.details.find((d: any) => d.label === 'This Week') && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">This Week</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {(() => {
                    const d = result.details.find((det: any) => det.label === 'This Week');
                    return d?.value && d.value % 1 !== 0 ? d.value.toFixed(2) : d?.value;
                  })()}
                  <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                </p>
              </div>
            )}
            {result.details.find((d: any) => d.label === 'Previous Week') && (
              <div className="space-y-0.5">
                <p className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Prev. Week</p>
                <p className="text-sm font-bold text-slate-700 dark:text-slate-300 font-mono">
                  {(() => {
                    const d = result.details.find((det: any) => det.label === 'Previous Week');
                    return d?.value && d.value % 1 !== 0 ? d.value.toFixed(2) : d?.value;
                  })()}
                  <span className="text-[10px] ml-0.5 font-normal opacity-70">{result.unit}</span>
                </p>
              </div>
            )}
          </div>
        )}

        {result.details && <><Separator className="my-3 bg-gray-100 dark:bg-slate-800" /><div className="space-y-1.5">{result.details.map((d: any, i: number) => (<div key={i} className="flex items-center justify-between text-xs"><span className="text-slate-400 dark:text-slate-500">{d.label}</span><span className="font-mono text-slate-700 dark:text-slate-300">{d.value}{d.unit ? ` ${d.unit}` : ''}</span></div>))}</div></>}
      </CardContent>
    </Card>
  );
}

// ─── Chart Card (Configurable Chart Component) ────────────────────────────────

interface ChartCardProps {
  config: ChartConfig;
  kpiResults: any[];
  hiddenDimensions: Set<string>;
  toggleDimension: (pluginId: string, value: string) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, newConfig: ChartConfig) => void;
  onClick: (keys: string[], title: string) => void;
  theme: 'light' | 'dark';
}

function ChartCard({ config, kpiResults, hiddenDimensions, toggleDimension, onRemove, onChange, onClick, theme }: ChartCardProps) {
  const kpiOptions = useMemo(() => getKpiOptions(kpiResults), [kpiResults]);
  const chartRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  // Check if selected KPI is a time-series plugin
  const isTimeSeries = config.kpiId ? isTimeSeriesPlugin(config.kpiId) : false;

  const selectedKpiData = useMemo(() => {
    if (!config.kpiId) return null;

    switch (config.type) {
      case 'bar':
        return transformForBarChart(kpiResults, config.kpiId);
      case 'pie':
        return transformForPieChart(kpiResults, config.kpiId);
      case 'line':
        return transformForLineChart(kpiResults, config.kpiId);
      default:
        return [];
    }
  }, [config.kpiId, config.type, kpiResults]);

  const handleLegendClick = (e: any) => {
    const dimensionName = e.id || e.value;
    if (dimensionName) {
      toggleDimension(config.kpiId, dimensionName);
    }
  };

  const handleKpiChange = (kpiId: string) => {
    const recommendedType = getRecommendedChartType(kpiResults, kpiId);
    onChange(config.id, { ...config, kpiId, type: recommendedType });
  };

  const handleExportChart = async () => {
    if (!chartRef.current) return;
    setExporting(true);
    try {
      // Wait for any animations to finish
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const dataUrl = await toPng(chartRef.current, {
        backgroundColor: theme === 'dark' ? '#0f172a' : '#ffffff',
        cacheBust: true,
        filter: (node: any) => {
          if (node.getAttribute && node.getAttribute('data-export-ignore') === 'true') {
            return false;
          }
          return true;
        },
        style: {
          borderRadius: '0'
        }
      });
      
      const link = document.createElement('a');
      const kpiName = kpiResults.find(k => k.pluginId === config.kpiId)?.results[0]?.name || 'kpi-chart';
      link.download = `${kpiName.toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = dataUrl;
      link.click();
      toast.success('Chart exported as PNG');
    } catch (err) {
      console.error('Failed to export chart:', err);
      toast.error('Failed to export chart');
    } finally {
      setExporting(false);
    }
  };

  const renderChart = () => {
    if (!config.kpiId || !selectedKpiData || selectedKpiData.length === 0) {
      return (
        <div className="h-64 flex items-center justify-center text-slate-400 dark:text-slate-500">
          <div className="text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p className="text-sm">Select a KPI to visualize</p>
          </div>
        </div>
      );
    }

    // Dynamic height based on width
    const chartHeight = {
      sm: 250,   // Narrow
      md: 300,   // Medium
      lg: 350,   // Wide
      full: 400,  // Full
    }[config.width];

    const kpi = kpiResults.find((k) => k.pluginId === config.kpiId);
    const unit = kpi?.results?.[0]?.unit || '';

    const renderLegend = (value: any) => {
      const isHidden = hiddenDimensions.has(`${config.kpiId}|${value}`);
      return (
        <span 
          className={`
            text-[10px] font-medium transition-all cursor-pointer select-none
            hover:text-blue-500 hover:underline
            ${isHidden ? 'opacity-30 line-through text-slate-500' : 'text-slate-700 dark:text-slate-300'}
          `}
        >
          {value}
        </span>
      );
    };

    switch (config.type) {
      case 'bar':
        const hasMultipleSeriesBar = kpi?.results && kpi.results.length > 1 &&
          kpi.results.every((r: any) => r.timeSeries && r.timeSeries.length > 0);

        if (hasMultipleSeriesBar) {
          const allPeriods = new Set<string>();
          kpi.results.forEach((result: any) => {
            result.timeSeries?.forEach((point: any) => allPeriods.add(point.period));
          });

          const sortedPeriods = Array.from(allPeriods).sort();
          const mergedData = sortedPeriods.map(period => {
            const dataPoint: any = { name: period };
            let isComplete = true;
            kpi.results.forEach((result: any, idx: number) => {
              const point = result.timeSeries?.find((p: any) => p.period === period);
              dataPoint[`series${idx}`] = point?.value || 0;
              if (point && point.isComplete === false) isComplete = false;
            });
            dataPoint.isComplete = isComplete;
            return dataPoint;
          });

          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <BarChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => formatChartValue(value, unit)}
                />
                <Legend 
                  onClick={handleLegendClick} 
                  cursor="pointer" 
                  formatter={renderLegend} 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
                {kpi.results.map((result: any, idx: number) => (
                  <Bar
                    key={result.name || idx}
                    dataKey={`series${idx}`}
                    name={result.name}
                    fill={CHART_COLORS[idx % CHART_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                    hide={hiddenDimensions.has(`${config.kpiId}|${result.name}`)}
                  >
                    {mergedData.map((entry: any, index: number) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                        fillOpacity={entry.isComplete === false ? 0.4 : 1}
                      />
                    ))}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          );
        }

        const visibleBarData = selectedKpiData.filter(d => !hiddenDimensions.has(`${config.kpiId}|${d.name}`));
        const hasWeeklyLayers = visibleBarData.some(d => (d.thisWeek && d.thisWeek !== 0) || (d.prevWeek && d.prevWeek !== 0));

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={visibleBarData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => formatChartValue(value, unit)}
              />
              {(hasWeeklyLayers || selectedKpiData.length > 1) && (
                <Legend 
                  onClick={handleLegendClick} 
                  cursor="pointer" 
                  formatter={renderLegend}
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                  payload={[
                    ...selectedKpiData.map((d, idx) => ({
                      value: d.name,
                      type: 'rect' as any,
                      id: d.name,
                      color: d.fill || CHART_COLORS[idx % CHART_COLORS.length]
                    }))
                  ]}
                />
              )}
              <Bar 
                dataKey="value" 
                name="Total Period" 
                radius={[4, 4, 0, 0]} 
                hide={hiddenDimensions.has(`${config.kpiId}|Total Period`)}
                cursor="pointer"
                onClick={(data) => {
                  if (data && data.ticketKeys) {
                    onClick(data.ticketKeys, data.name || 'Total Period');
                  }
                }}
              >
                {visibleBarData.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]}
                    fillOpacity={entry.isComplete === false ? 0.4 : 1}
                  />
                ))}
              </Bar>
              {hasWeeklyLayers && (
                <>
                  <Bar 
                    dataKey="thisWeek" 
                    name="This Week" 
                    fill="#3b82f6" 
                    radius={[4, 4, 0, 0]} 
                    hide={hiddenDimensions.has(`${config.kpiId}|This Week`)}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data && data.ticketKeys) {
                        onClick(data.ticketKeys, "This Week");
                      }
                    }}
                  />
                  <Bar 
                    dataKey="prevWeek" 
                    name="Prev Week" 
                    fill="#94a3b8" 
                    radius={[4, 4, 0, 0]} 
                    hide={hiddenDimensions.has(`${config.kpiId}|Prev Week`)}
                    cursor="pointer"
                    onClick={(data) => {
                      if (data && data.ticketKeys) {
                        onClick(data.ticketKeys, "Prev Week");
                      }
                    }}
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        );

      case 'line':
        const hasMultipleSeries = kpi?.results && kpi.results.length > 1 &&
          kpi.results.every((r: any) => r.timeSeries && r.timeSeries.length > 0);

        if (hasMultipleSeries) {
          const allPeriods = new Set<string>();
          kpi.results.forEach((result: any) => {
            result.timeSeries?.forEach((point: any) => allPeriods.add(point.period));
          });

          const sortedPeriods = Array.from(allPeriods).sort();
          const mergedData = sortedPeriods.map(period => {
            const dataPoint: any = { name: period };
            let isComplete = true;
            kpi.results.forEach((result: any, idx: number) => {
              const point = result.timeSeries?.find((p: any) => p.period === period);
              dataPoint[`series${idx}`] = point?.value || 0;
              if (point && point.isComplete === false) isComplete = false;
            });
            dataPoint.isComplete = isComplete;
            return dataPoint;
          });

          return (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={mergedData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
                <XAxis dataKey="name" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'rgba(15, 23, 42, 0.9)',
                    border: '1px solid rgba(148, 163, 184, 0.2)',
                    borderRadius: '8px',
                  }}
                  labelStyle={{ color: '#e2e8f0' }}
                  itemStyle={{ color: '#e2e8f0' }}
                  formatter={(value: number) => formatChartValue(value, unit)}
                />
                <Legend 
                  onClick={handleLegendClick} 
                  cursor="pointer" 
                  formatter={renderLegend} 
                  verticalAlign="top" 
                  align="right"
                  wrapperStyle={{ paddingBottom: '20px' }}
                />
                {kpi.results.map((result: any, idx: number) => {
                  const color = CHART_COLORS[idx % CHART_COLORS.length];
                  return (
                    <Line
                      key={result.name || idx}
                      type="monotone"
                      dataKey={`series${idx}`}
                      name={result.name}
                      stroke={color}
                      strokeWidth={2}
                      dot={(props) => {
                        const { cx, cy, payload } = props;
                        if (payload.isComplete === false) {
                          return (
                            <circle 
                              key={`dot-${idx}-${payload.name}`}
                              cx={cx} cy={cy} r={4} 
                              fill="transparent" 
                              stroke={color} 
                              strokeWidth={2} 
                              strokeDasharray="2 2" 
                            />
                          );
                        }
                        return <circle key={`dot-${idx}-${payload.name}`} cx={cx} cy={cy} r={4} fill={color} />;
                      }}
                      hide={hiddenDimensions.has(`${config.kpiId}|${result.name}`)}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          );
        }

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={selectedKpiData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-gray-200 dark:stroke-gray-700" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis className="text-xs" />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number) => formatChartValue(value, unit)}
              />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke="#3b82f6" 
                strokeWidth={2} 
                dot={(props) => {
                  const { cx, cy, payload } = props;
                  if (payload.isComplete === false) {
                    return (
                      <circle 
                        key={`dot-${payload.name}`}
                        cx={cx} cy={cy} r={4} 
                        fill="transparent" 
                        stroke="#3b82f6" 
                        strokeWidth={2} 
                        strokeDasharray="2 2" 
                      />
                    );
                  }
                  return <circle key={`dot-${payload.name}`} cx={cx} cy={cy} r={4} fill="#3b82f6" />;
                }} 
              />
            </LineChart>
          </ResponsiveContainer>
        );

      case 'pie':
        const visiblePieData = selectedKpiData.filter(d => !hiddenDimensions.has(`${config.kpiId}|${d.name}`));

        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={visiblePieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value, payload }) => `${name}: ${formatChartValue(value, payload.unit)}`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {visiblePieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill || CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Legend 
                onClick={handleLegendClick} 
                cursor="pointer" 
                formatter={renderLegend} 
                verticalAlign="top" 
                align="right"
                wrapperStyle={{ paddingBottom: '20px' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(15, 23, 42, 0.9)',
                  border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: '#e2e8f0' }}
                itemStyle={{ color: '#e2e8f0' }}
                formatter={(value: number, name: string, props: any) => [formatChartValue(value, props.payload.unit), name]}
              />
            </PieChart>
          </ResponsiveContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Card id={`chart-card-${config.id}`} ref={chartRef} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`rounded-lg p-2 ${isTimeSeries ? 'bg-blue-100 dark:bg-blue-500/10' : 'bg-emerald-100 dark:bg-emerald-500/10'}`}>
              <BarChart3 className={`h-5 w-5 ${isTimeSeries ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
            </div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Chart Visualization</CardTitle>
              {isTimeSeries && (
                <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-500/30">
                  📈 Trend
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {config.kpiId && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleExportChart}
                disabled={exporting}
                data-export-ignore="true"
                className="text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
              >
                {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onRemove(config.id)}
              data-export-ignore="true"
              className="text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Inline Controls */}
        <div className="flex flex-wrap gap-3" data-export-ignore="true">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">KPI Metric</Label>
            <Select value={config.kpiId} onValueChange={handleKpiChange}>
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue placeholder="Select KPI..." />
              </SelectTrigger>
              <SelectContent>
                {kpiOptions.timeSeries.length > 0 && (
                  <SelectGroup>
                    <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      📈 Time-Series Trends
                    </SelectLabel>
                    {kpiOptions.timeSeries.map((option: any) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
                {kpiOptions.regular.length > 0 && (
                  <>
                    {kpiOptions.timeSeries.length > 0 && <SelectSeparator />}
                    <SelectGroup>
                      <SelectLabel className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                        📊 Standard KPIs
                      </SelectLabel>
                      {kpiOptions.regular.map((option: any) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[140px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Chart Type</Label>
            <Select
              value={config.type}
              onValueChange={(type: 'bar' | 'line' | 'pie') => onChange(config.id, { ...config, type })}
              disabled={!config.kpiId}
            >
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bar">Bar Chart</SelectItem>
                <SelectItem value="line">Line Chart</SelectItem>
                <SelectItem value="pie">Pie Chart</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-[120px]">
            <Label className="text-xs text-slate-500 dark:text-slate-400 mb-1 block">Width</Label>
            <Select
              value={config.width}
              onValueChange={(width: 'sm' | 'md' | 'lg' | 'full') => onChange(config.id, { ...config, width })}
            >
              <SelectTrigger className="bg-gray-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Narrow</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Wide</SelectItem>
                <SelectItem value="full">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Chart Area */}
        <div className="mt-4">{renderChart()}</div>
      </CardContent>
    </Card>
  );
}
