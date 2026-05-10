'use client';

import { KpiCard, ChartCard } from './KpiCard';
import { AppSettings } from '@/lib/config/local-store';
import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { KpiDataTable } from './KpiDataTable';
import { KpiErrorBoundary } from './KpiErrorBoundary';
import { ViewManager } from './ViewManager';
import { Virtuoso } from 'react-virtuoso';
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
  AreaChart, Area
} from 'recharts';
import {
  Activity, Target, Timer, UserCheck, BarChart3, Clock, AlertTriangle,
  TrendingUp, Zap, Calendar, EyeOff, X, RotateCw, Plus, Trash2,
  Download, Loader2, Edit2, Ticket, ExternalLink, Sliders, CheckCircle2,
  ArrowUp, Search, ChevronDown, ChevronUp, Database, Filter, RefreshCw,
  Save, 
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toPng } from 'html-to-image';
import { localConfig, type SavedJql } from '@/lib/config/local-store';
import { ChartConfig, KpiCalcResult } from '@/types/dashboard';
import { JqlAutocomplete } from './JqlAutocomplete';
import { useAppStore } from '@/store/app-store';

export function KpiDashboard() {
  const {
    connections, extractionResult, masterDatasetInfo, setMasterDatasetInfo,
    dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion,
    activeConnectionId, settings, kpiResults, setKpiResults, storageConfig,
    globalFilters, setGlobalFilters, hiddenDimensions, setHiddenDimensions,
    dashboardCharts: charts, setDashboardCharts: setCharts,
    dashboardJqlQuery: jqlQuery, setDashboardJqlQuery: setJqlQuery,
    filterPanelOpen, setFilterPanelOpen, theme, showFloatingBar,
    setActiveTab, kpiSubTab, setKpiSubTab,
    customWidgetResults, setCustomWidgetResults, calculatingWidgets, setCalculatingWidgets,
    activeView, setIsViewModified, setActiveView,
    widgetTitles, setWidgetTitles
  } = useAppStore();

  const onPrint = () => window.print();
  const isFirstRender = useRef(true);
  const hasUserInitiatedCalc = useRef(false);

  // State for panel expansion
  const [assigneePanelExpanded, setAssigneePanelExpanded] = useState(true);
  const [statusTimePanelExpanded, setStatusTimePanelExpanded] = useState(true);
  const [distributionPanelExpanded, setDistributionPanelExpanded] = useState(true);
  const [prioritySlaPanelExpanded, setPrioritySlaPanelExpanded] = useState(true);
  const [otherPriorityPanelExpanded, setOtherPriorityPanelExpanded] = useState(true);
  const [statusSlaPanelExpanded, setStatusSlaPanelExpanded] = useState(true);
  const [activePluginsOrder, setActivePluginsOrder] = useState<string[]>([]);


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

    const fromDateNormalized = fromDate ? new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()) : null;
    const masterStartNormalized = masterStart ? new Date(masterStart.getFullYear(), masterStart.getMonth(), masterStart.getDate()) : null;

    const isTruncated = masterStartNormalized && fromDateNormalized && fromDateNormalized < masterStartNormalized;

    return {
      isAnyPresetActive: isActive,
      isDataTruncated: !!isTruncated,
      availableStartDate: masterStart ? masterStart.toLocaleDateString() : null
    };
  }, [dateFrom, dateTo, masterDatasetInfo]);

  // JQL-Lite Filter state
  const [dashboardJqls, setDashboardJqls] = useState<SavedJql[]>([]);
  const [jqlToDelete, setJqlToDelete] = useState<string | null>(null);
  const [editingJqlId, setEditingJqlId] = useState<string | null>(null);

  // Staging filters for multi-select without instant update
  const [pendingFilters, setPendingFilters] = useState<Record<string, string[]>>(globalFilters);

  const [drillDownKeys, setDrillDownKeys] = useState<string[] | null>(null);
  const [drillDownTitle, setDrillDownTitle] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const jqlInputRef = useRef<HTMLInputElement>(null);


  // Load saved JQLs on mount
  useEffect(() => {
    setDashboardJqls(localConfig.getDashboardJqls());

    // Load active plugins order for initial sorting
    const raw = typeof window !== 'undefined' ? localStorage.getItem('cfg_active_plugins') : null;
    if (raw) {
      setActivePluginsOrder(JSON.parse(raw));
    }
  }, []);

  const saveDashboardJqls = (updated: SavedJql[]) => {
    setDashboardJqls(updated);
    localConfig.saveDashboardJqls(updated);
  };

  // @MX:NOTE: Saved View change detection and auto-save logic
  useEffect(() => {
    if (!activeView) {
      setIsViewModified(false);
      return;
    }

    const currentData = {
      dateFrom,
      dateTo,
      region,
      globalFilters,
      charts,
      dashboardJqlQuery: jqlQuery,
      kpiCardConfigs,
      hiddenDimensions: Array.from(hiddenDimensions),
      widgetTitles,
    };

    try {
      const savedData = JSON.parse(activeView.data);
      
      // Deep comparison via stringification
      const isModified = JSON.stringify(currentData) !== JSON.stringify(savedData);
      setIsViewModified(isModified);

      // Auto-save logic
      if (isModified && activeView.autoSaveEnabled) {
        const timeoutId = setTimeout(async () => {
          try {
            const res = await fetch(`/api/dashboard/views/${activeView.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                data: JSON.stringify(currentData),
                storageConfig
              })
            });
            const data = await res.json();
            if (data.success) {
              setActiveView(data.view);
              setIsViewModified(false);
            }
          } catch (error) {
            console.error('Auto-save failed:', error);
          }
        }, 3000); // 3 second debounce

        return () => clearTimeout(timeoutId);
      }
    } catch (e) {
      console.error('Failed to parse active view data:', e);
    }
  }, [
    activeView?.id, 
    activeView?.autoSaveEnabled,
    dateFrom, 
    dateTo, 
    region, 
    globalFilters, 
    charts, 
    jqlQuery, 
    kpiCardConfigs, 
    hiddenDimensions, 
    widgetTitles,
    setIsViewModified,
    setActiveView,
    storageConfig
  ]);

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
    hasUserInitiatedCalc.current = true;
    setGlobalFilters(pendingFilters);
    toast.success('Filters applied');
  };

  const handleUpdateFilter = (key: string, value: string) => {
    setPendingFilters(prev => {
      const updated = { ...prev };
      if (updated[key]) {
        updated[key] = updated[key].filter(v => v !== value);
        if (updated[key].length === 0) delete updated[key];
      }
      return updated;
    });
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
    setCharts([...charts, { id, kpiId: '', type: 'bar', width: 'md', height: 'md', jqlFilter: { enabled: false, query: '', mode: 'override' } }]);
  };

  const handleRemoveChart = (id: string) => {
    setCharts(charts.filter(c => c.id !== id));
  };

  const handleUpdateChart = (id: string, newConfig: ChartConfig) => {
    setCharts(charts.map(c => c.id === id ? newConfig : c));
  };

  const handleMoveChart = (id: string, direction: 'up' | 'down') => {
    const index = charts.findIndex(c => c.id === id);
    if (index === -1) return;
    const newCharts = [...charts];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= charts.length) return;
    [newCharts[index], newCharts[targetIndex]] = [newCharts[targetIndex], newCharts[index]];
    setCharts(newCharts);
    toast.info('Chart order updated');
  };

  const handleDrillDown = (keys: string[], title: string) => {
    setDrillDownKeys(keys);
    setDrillDownTitle(title);
  };

  const { data: calculationData, isLoading: calculating, refetch: runCalculation } = useQuery({
    queryKey: ['kpis', activeConnectionId, dateFrom, dateTo, globalFilters, region, settings, storageConfig, masterDatasetInfo?.issues?.length],
    queryFn: async () => {
      if (!activeConnectionId) return null;
      const res = await fetch('/api/kpi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: activeConnectionId,
          issues: masterDatasetInfo?.issues || [],
          dateFrom,
          dateTo,
          region,
          globalFilters,
          settings,
          storageConfig
        })
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Calculation failed');
      return data.results.map((r: KpiCalcResult) => ({
        ...r,
        results: r.results.map((res: any) => ({
          ...res,
          unit: res.unit || '',
          value: typeof res.value === 'number' ? res.value : 0
        }))
      }));
    },
    enabled: !!activeConnectionId && !!masterDatasetInfo?.issues,
    refetchInterval: (settings as AppSettings)?.webhooks?.enabled ? 30000 : false, // Refetch every 30s if webhooks are enabled
  });

  useEffect(() => {
    if (calculationData) {
      setKpiResults(calculationData);
    }
  }, [calculationData, setKpiResults]);

  // @MX:NOTE: Calculate KPI results for a specific widget with custom JQL
  // @MX:REASON: Independent widget calculations allow side-by-side data comparison
  const calculateWidgetJql = useCallback(async (widgetId: string, jqlFilter: any) => {
    if (!activeConnectionId || !masterDatasetInfo?.issues) return;

    // Track loading state
    setCalculatingWidgets(prev => { const s = new Set(prev); s.add(widgetId); return s; });

    try {
      // @MX:NOTE: Implement basic client-side JQL filtering
      // @MX:REASON: API doesn't support customJql, so we filter issues client-side
      // Supports: field = "v", field != "v", field CONTAINS "v", field NOT CONTAINS "v",
      //           field IN (v1,v2), field NOT IN (v1,v2)
      // Fields are resolved from both flat (issue.field) and nested (issue.fields.field) shapes.
      let filteredIssues = masterDatasetInfo.issues;

      if (jqlFilter.enabled && jqlFilter.mode !== 'override' && globalFilters) {
        Object.entries(globalFilters).forEach(([key, values]) => {
          if (values && values.length > 0) {
            filteredIssues = filteredIssues.filter((issue: any) => {
              const rawValue = issue[key] ?? issue.fields?.[key];
              let normalizedValue = rawValue;
              if (rawValue && typeof rawValue === 'object') {
                if (Array.isArray(rawValue)) {
                  normalizedValue = rawValue.map((v: any) => v.displayName || v.name || v.value || String(v)).join(',');
                } else {
                  normalizedValue = rawValue.displayName || rawValue.name || rawValue.value || rawValue.key || String(rawValue);
                }
              }
              const issueValue = String(normalizedValue || '').trim().toLowerCase();
              // Array dimensions like components/labels might need partial match, but globalFilters uses exact match
              return values.some(v => {
                const lowerV = v.toLowerCase();
                return issueValue === lowerV || issueValue.split(',').includes(lowerV);
              });
            });
          }
        });
      }

      if (jqlFilter.enabled && jqlFilter.query) {
        const query = jqlFilter.query.trim();
        let field = '';
        let operator = '';
        let value = '';

        // IMPORTANT: More specific patterns must come first!
        const patterns = [
          { regex: /(\w+)\s*=\s*"([^"]+)"/, op: '=' },
          { regex: /(\w+)\s*!=\s*"([^"]+)"/, op: '!=' },
          { regex: /(\w+)\s+NOT\s+CONTAINS\s+"([^"]+)"/i, op: 'NOT CONTAINS' },
          { regex: /(\w+)\s+CONTAINS\s+"([^"]+)"/i, op: 'CONTAINS' },
          { regex: /(\w+)\s+NOT\s+IN\s+\(([^)]+)\)/i, op: 'NOT IN' },
          { regex: /(\w+)\s+IN\s+\(([^)]+)\)/i, op: 'IN' }
        ];

        for (const pattern of patterns) {
          const match = query.match(pattern.regex);
          if (match) {
            field = match[1];
            operator = pattern.op;
            value = (operator === 'IN' || operator === 'NOT IN') ? match[2] : match[2].toLowerCase();
            break;
          }
        }

        if (field && operator && value) {
          filteredIssues = masterDatasetInfo.issues.filter((issue: any) => {
            // Support both flat (issue.summary) and nested (issue.fields.summary) issue shapes
            const rawValue = issue[field] ?? issue.fields?.[field];
            let normalizedValue = rawValue;
            if (rawValue && typeof rawValue === 'object') {
              if (Array.isArray(rawValue)) {
                normalizedValue = rawValue.map((v: any) => v.displayName || v.name || v.value || String(v)).join(',');
              } else {
                normalizedValue = rawValue.displayName || rawValue.name || rawValue.value || rawValue.key || String(rawValue);
              }
            }
            const issueValue = String(normalizedValue || '').trim().toLowerCase();

            switch (operator) {
              case '=':            return issueValue.toLowerCase() === value;
              case '!=':           return issueValue.toLowerCase() !== value;
              case 'CONTAINS':     return issueValue.toLowerCase().includes(value);
              case 'NOT CONTAINS': return !issueValue.toLowerCase().includes(value);
              case 'IN': {
                const values = value.split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
                return values.some(v => v.toLowerCase() === issueValue.toLowerCase());
              }
              case 'NOT IN': {
                const values = value.split(',').map(v => v.trim().replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
                return !values.some(v => v.toLowerCase() === issueValue.toLowerCase());
              }
              default: return true;
            }
          });
        } else {
          // Fallback: full-text search across summary, key, description
          const queryLower = query.toLowerCase();
          filteredIssues = masterDatasetInfo.issues.filter((issue: any) => {
            const text = `${issue.summary ?? issue.fields?.summary ?? ''} ${issue.key} ${issue.description ?? issue.fields?.description ?? ''}`.toLowerCase();
            return text.includes(queryLower);
          });
        }
      }

      const res = await fetch('/api/kpi/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: activeConnectionId,
          issues: filteredIssues,
          dateFrom,
          dateTo,
          region,
          // Only pass globalFilters if NOT using custom JQL override
          globalFilters: (jqlFilter.enabled && jqlFilter.mode === 'override') ? undefined : globalFilters,
          settings,
          storageConfig
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Widget calculation failed');

      const results = data.results.map((r: KpiCalcResult) => ({
        ...r,
        results: r.results.map((res: any) => ({
          ...res,
          unit: res.unit || '',
          value: typeof res.value === 'number' ? res.value : 0
        }))
      }));

      // @MX:NOTE: Use getState() to read the latest map — avoids stale closure from useCallback snapshot
      const latestMap = new Map(useAppStore.getState().customWidgetResults);
      latestMap.set(widgetId, {
        results,
        context: {
          query: jqlFilter.query,
          mode: jqlFilter.mode,
          dateFrom,
          dateTo,
          region,
          globalFilters: (jqlFilter.enabled && jqlFilter.mode === 'override') ? undefined : globalFilters,
          activeConnectionId,
          issuesLength: masterDatasetInfo.issues.length
        }
      });
      setCustomWidgetResults(latestMap);
    } catch (error) {
      console.error(`Failed to calculate widget ${widgetId}:`, error);
      toast.error(`Failed to apply custom JQL filter`);
    } finally {
      setCalculatingWidgets(prev => { const s = new Set(prev); s.delete(widgetId); return s; });
    }
  }, [activeConnectionId, masterDatasetInfo, calculatingWidgets, jqlQuery, dateFrom, dateTo, region, globalFilters, settings, storageConfig, setCalculatingWidgets, setCustomWidgetResults]);

  // @MX:NOTE: Auto-recalculate custom widgets when dashboard inputs change
  useEffect(() => {
    if (!calculateWidgetJql || !masterDatasetInfo?.issues?.length) return;

    customWidgetResults.forEach((entry: any, widgetId: string) => {
      const ctx = entry?.context;
      if (!ctx) return;

      const isGlobalFiltersMismatched = ctx.mode === 'override' 
        ? false // When overriding, global filter changes don't matter
        : JSON.stringify(ctx.globalFilters) !== JSON.stringify(globalFilters);

      const needsRecalc = 
        ctx.dateFrom !== dateFrom ||
        ctx.dateTo !== dateTo ||
        ctx.region !== region ||
        ctx.activeConnectionId !== activeConnectionId ||
        ctx.issuesLength !== masterDatasetInfo?.issues?.length ||
        isGlobalFiltersMismatched;

      if (needsRecalc) {
        calculateWidgetJql(widgetId, { enabled: true, query: ctx.query, mode: ctx.mode });
      }
    });
  }, [
    dateFrom, dateTo, region, globalFilters, settings, storageConfig, masterDatasetInfo, 
    customWidgetResults, calculateWidgetJql, activeConnectionId
  ]);

  // Filter KPI results and dashboard charts based on active plugins
  const lastFilteredPlugins = useRef<Set<string>>(new Set());

  useEffect(() => {
    const filterByActivePlugins = () => {
      const raw = typeof window !== 'undefined' ? localStorage.getItem('cfg_active_plugins') : null;
      
      // If never configured (null), show all plugins by default
      if (raw === null) {
        lastFilteredPlugins.current = new Set(['__DEFAULT_ALL__']);
        return;
      }

      const activePlugins = JSON.parse(raw) as string[];
      const activePluginsSet = new Set<string>(activePlugins);

      // Skip ONLY if both active plugins haven't changed AND kpiResults/charts are already likely filtered
      // But we must allow filtering if kpiResults just got updated with full data
      const isPluginsSame = activePluginsSet.size === lastFilteredPlugins.current.size &&
          Array.from(activePluginsSet).every(p => lastFilteredPlugins.current.has(p));
      
      // If plugins are same, we still check if we need to filter kpiResults
      // (e.g. if kpiResults contains items not in activePluginsSet)
      if (isPluginsSame) {
        const needsKpiFilter = kpiResults.some(kpi => !activePluginsSet.has(kpi.pluginId));
        const needsChartFilter = charts.some(chart => chart.kpiId && !activePluginsSet.has(chart.kpiId));
        if (!needsKpiFilter && !needsChartFilter) return;
      }

      lastFilteredPlugins.current = activePluginsSet;

      // Filter kpiResults to only include active plugins
      if (activePlugins.length === 0) {
        if (kpiResults.length > 0) setKpiResults([]);
      } else {
        const filteredResults = kpiResults.filter(kpi => activePlugins.includes(kpi.pluginId));
        if (filteredResults.length !== kpiResults.length) {
          setKpiResults(filteredResults);
        }
      }

      // Filter dashboard charts to only include active plugins
      if (activePlugins.length === 0) {
        if (charts.length > 0) setCharts([]);
      } else {
        const filteredCharts = charts.filter(chart => !chart.kpiId || activePlugins.includes(chart.kpiId));
        if (filteredCharts.length !== charts.length) {
          setCharts(filteredCharts);
        }
      }
    };

    // Filter on mount and when storage changes
    filterByActivePlugins();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cfg_active_plugins') {
        filterByActivePlugins();
        // Force re-render of sorted KPIs
        const raw = localStorage.getItem('cfg_active_plugins');
        if (raw) {
          setActivePluginsOrder(JSON.parse(raw));
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [kpiResults, charts, setKpiResults, setCharts]);

  const handleExportKpis = () => {
    const rows: string[][] = [['Metric', 'Value', 'Unit', 'Category']];
    kpiResults.forEach(kpi => {
      kpi.results.forEach((res: any) => {
        rows.push([
          `"${res.name}"`,
          res.value.toString(),
          `"${res.unit || ''}"`,
          `"${kpi.pluginId}"`
        ]);
      });
    });

    const csvContent = "\uFEFF" + rows.map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `jira_kpis_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('KPIs exported to CSV');
  };

  useEffect(() => {
    // Only auto-calculate if user has previously initiated a calculation
    if (hasUserInitiatedCalc.current) {
      runCalculation();
    }
    // On first render, just mark as rendered - don't auto-calculate
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, [runCalculation]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if (e.key.toLowerCase() === 'r') {
        e.preventDefault();
        hasUserInitiatedCalc.current = true;
        runCalculation();
        toast.info('Recalculating KPIs...');
      }

      if (e.key === '/') {
        e.preventDefault();
        setFilterPanelOpen(true);
        setTimeout(() => {
          jqlInputRef.current?.focus();
        }, 100);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [runCalculation, setFilterPanelOpen]);

  const sortedKpiResults = useMemo(() => {
    const raw = typeof window !== 'undefined' ? localStorage.getItem('cfg_active_plugins') : null;
    if (raw === null) return kpiResults; // Default: show all if never configured

    const activeOrder = JSON.parse(raw) as string[];
    if (activeOrder.length === 0) return []; // Explicitly none if user unchecked all

    return [...kpiResults].sort((a, b) => {
      const idxA = activeOrder.indexOf(a.pluginId);
      const idxB = activeOrder.indexOf(b.pluginId);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [kpiResults, activePluginsOrder]);

  const mainKpis = sortedKpiResults.filter((r: KpiCalcResult) => !r.results[0]?.dimensions?.status && !r.results[0]?.dimensions?.priority && !r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  const assigneeKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  const statusKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.status && r.pluginId === 'time_in_status' && !isTimeSeriesPlugin(r.pluginId));
  const slaStatusKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.status && (r.pluginId === 'sla_by_status' || r.pluginId === 'sla_by_status_excl_clone') && !isTimeSeriesPlugin(r.pluginId));
  const slaPriorityKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.pluginId === 'sla_by_priority');
  const otherPriorityKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.priority && r.pluginId !== 'sla_by_priority' && !isTimeSeriesPlugin(r.pluginId));
  const distributionKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.bucket && !isTimeSeriesPlugin(r.pluginId));
  const timeSeriesKpis = sortedKpiResults.filter((r: KpiCalcResult) => isTimeSeriesPlugin(r.pluginId));

  // Results specifically for the Table View (Metrics Overview)
  // Excludes trend items (time series) and metrics with specific breakdown dimensions
  const tableKpiResults = useMemo(() => {
    return sortedKpiResults.filter((r: KpiCalcResult) =>
      !r.results[0]?.dimensions?.status &&
      !r.results[0]?.dimensions?.priority &&
      !r.results[0]?.dimensions?.assignee &&
      !isTimeSeriesPlugin(r.pluginId)
    );
  }, [sortedKpiResults]);

  const filterOptions = useMemo(() => {
    const options = { project: new Set<string>(), assignee: new Set<string>(), priority: new Set<string>(), issueType: new Set<string>(), status: new Set<string>(), component: new Set<string>(), label: new Set<string>() };
    if (masterDatasetInfo?.issues) {
      masterDatasetInfo.issues.forEach((i: any) => {
        const f = i.fields || {};
        const projectName = f.project?.name || i.key?.split('-')[0];
        if (projectName) options.project.add(projectName);
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
              <div className="flex items-center gap-3">
                <CardTitle className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-emerald-600 to-blue-600 dark:from-emerald-400 dark:to-blue-400">
                  KPI Analytics
                </CardTitle>
                <div className="flex items-center gap-1 no-print">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      hasUserInitiatedCalc.current = true;
                      runCalculation();
                      toast.info('Recalculating KPIs...');
                    }}
                    disabled={calculating}
                    className="h-6 px-2 text-[10px] text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 gap-1 rounded-md"
                  >
                    <RefreshCw className={`h-3 w-3 ${calculating ? 'animate-spin' : ''}`} />
                    Recalculate
                  </Button>
                  <ViewManager />
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
                {isDataTruncated && (
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="h-4 py-0 text-[9px] border-amber-500/30 text-amber-500 gap-1 animate-pulse cursor-help">
                        <AlertTriangle className="h-2.5 w-2.5" /> Data Truncated
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-3 shadow-lg border-amber-200 dark:border-amber-800">
                      <p className="text-xs">
                        Your selected analysis starts on <strong className="text-amber-600 dark:text-amber-400">{new Date(dateFrom).toLocaleDateString()}</strong>, but your local dataset only contains data from <strong className="text-amber-600 dark:text-amber-400">{availableStartDate}</strong> onwards.<br /><br />
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
                        value={dateFrom || ''}
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
                        value={dateTo || ''}
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
                  // Safely handle masterEnd - use Date.now() if 'to' is missing or invalid
                  let masterEnd: Date | null = null;
                  if (masterDatasetInfo?.dateRange?.to) {
                    try {
                      const parsedEnd = new Date(masterDatasetInfo.dateRange.to);
                      if (!isNaN(parsedEnd.getTime())) {
                        masterEnd = parsedEnd;
                      }
                    } catch {
                      // Invalid date, will use null
                    }
                  }

                  const masterStartNormalized = masterStart ? new Date(masterStart) : null;
                  const masterEndNormalized = masterEnd ? new Date(masterEnd) : null;
                  if (masterStartNormalized) masterStartNormalized.setHours(0, 0, 0, 0);
                  if (masterEndNormalized) masterEndNormalized.setHours(23, 59, 59, 999);

                  const isAvailable = p.label === 'MAX' ? !!masterStartNormalized : (!masterStartNormalized || targetStart >= masterStartNormalized);

                  const todayStr = today.toISOString().split('T')[0];
                  const startStr = targetStart.toISOString().split('T')[0];
                  const maxEndStr = masterEndNormalized ? masterEndNormalized.toISOString().split('T')[0] : todayStr;

                  // Check if MAX should be active (must match both start AND end dates)
                  const isMaxActive = masterStart && dateFrom === new Date(masterStart).toISOString().split('T')[0] && dateTo === maxEndStr;

                  const isActive = p.label === 'MAX'
                    ? isMaxActive
                    : !isMaxActive && dateTo === todayStr && dateFrom === startStr;

                  return (
                    <Button
                      key={p.label}
                      variant={isActive ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => {
                        // Skip if already active to prevent unnecessary recalculation
                        if (isActive) return;

                        hasUserInitiatedCalc.current = true;
                        if (p.label === 'MAX' && masterDatasetInfo?.dateRange) {
                          const fromStr = new Date(masterDatasetInfo.dateRange.from).toISOString().split('T')[0];
                          const toStr = maxEndStr;
                          setDateFrom(fromStr);
                          setDateTo(toStr);
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
            <div className="mt-6 pt-6 border-t border-slate-100 dark:border-slate-800 space-y-4 animate-in slide-in-from-top-4 duration-300" data-filter-section>
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
                          toast.success('Filter updated');

                          setPendingFilters(prev => {
                            const jqlFilters = (prev['jql'] || []).filter(q => oldJql ? q !== oldJql.query : true);
                            if (!jqlFilters.includes(jqlQuery)) jqlFilters.push(jqlQuery);
                            return { ...prev, jql: jqlFilters };
                          });
                        } else {
                          const id = `djql-${Date.now()}`;
                          const newQuery = jqlQuery;
                          saveDashboardJqls([...dashboardJqls, { id, name: newQuery, query: newQuery }]);
                          setJqlQuery('');
                          toast.success('Filter saved to dashboard');

                          setPendingFilters(prev => {
                            const jqlFilters = prev['jql'] || [];
                            if (!jqlFilters.includes(newQuery)) return { ...prev, jql: [...jqlFilters, newQuery] };
                            return prev;
                          });
                        }
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
                                : `All ${filter.label}${filter.label === 'Priority' ? 'ies' : filter.label === 'Status' ? 'es' : 's'}`}
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
                                <Checkbox checked={!!pendingFilters[filter.key]?.includes(opt)} onCheckedChange={() => { }} />
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

              {Object.keys(pendingFilters).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(Object.entries(pendingFilters) as [string, string[]][]).map(([key, values]) => (
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
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-500" />
              Metrics Overview
            </h3>

            <div className="flex items-center gap-2 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg w-fit">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className={`h-7 text-[10px] uppercase tracking-wider font-bold transition-all ${viewMode === 'grid' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Grid View
              </Button>
              <Button
                variant={viewMode === 'table' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
                className={`h-7 text-[10px] uppercase tracking-wider font-bold transition-all ${viewMode === 'table' ? 'bg-emerald-600 hover:bg-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                Table View
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportKpis}
              className="h-8 text-[10px] uppercase tracking-wider font-bold border-emerald-500/20 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
            >
              <Download className="h-3.5 w-3.5 mr-1.5" />
              Export CSV
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
              {mainKpis.map((kpi) => kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                if (hiddenDimensions.has(`${kpi.pluginId}|`)) return null;
                const titleKey = `${kpi.pluginId}|${result.name}`;
                return (
                  <KpiErrorBoundary key={`${kpi.pluginId}-${idx}`} name={result.name}>
                    <KpiCard
                      result={result}
                      pluginId={kpi.pluginId}
                      onHide={() => toggleDimension(kpi.pluginId, '')}
                      onClick={result.ticketKeys ? () => {
                        handleDrillDown(result.ticketKeys || [], result.name);
                      } : undefined}
                      customTitle={widgetTitles[titleKey]}
                      onTitleChange={(newTitle) => {
                        setWidgetTitles(prev => {
                          const next = { ...prev };
                          if (newTitle) next[titleKey] = newTitle;
                          else delete next[titleKey];
                          return next;
                        });
                      }}
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
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2"><Timer className="h-5 w-5 text-blue-400" />Turnaround Time by Status</CardTitle>
                  <button
                    onClick={() => setStatusTimePanelExpanded(!statusTimePanelExpanded)}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                    title={statusTimePanelExpanded ? "Collapse" : "Expand"}
                    aria-label={statusTimePanelExpanded ? "Collapse section" : "Expand section"}
                  >
                    {statusTimePanelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
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
            {statusTimePanelExpanded && (
              <CardContent>
              <div className="space-y-3">{statusKpis.map((kpi) => {
                const visibleResults = kpi.results.filter((r: KpiCalcResult['results'][0]) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status || r.name}`));
                const maxVal = Math.max(...visibleResults.map((r: KpiCalcResult['results'][0]) => r.value), 1);

                return visibleResults.map((result: KpiCalcResult['results'][0], idx: number) => (
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
            )}
          </Card>
        )}

        {distributionKpis.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-purple-400" />
                Distribution Analysis
              </h3>
              <button
                onClick={() => setDistributionPanelExpanded(!distributionPanelExpanded)}
                className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                title={distributionPanelExpanded ? "Collapse" : "Expand"}
                aria-label={distributionPanelExpanded ? "Collapse section" : "Expand section"}
              >
                {distributionPanelExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
            </div>
            {distributionPanelExpanded && (
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
                        // Custom sort for buckets based on plugin
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

                        const maxVal = Math.max(...sortedResults.map((r: KpiCalcResult['results'][0]) => r.value), 1);

                        return sortedResults.map((result: KpiCalcResult['results'][0], idx: number) => (
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
            )}
          </div>
        )}

        {slaPriorityKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-amber-400" />SLA by Priority</CardTitle>
                  <button
                    onClick={() => setPrioritySlaPanelExpanded(!prioritySlaPanelExpanded)}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                    title={prioritySlaPanelExpanded ? "Collapse" : "Expand"}
                    aria-label={prioritySlaPanelExpanded ? "Collapse section" : "Expand section"}
                  >
                    {prioritySlaPanelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
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
            {prioritySlaPanelExpanded && (
              <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid-3">{slaPriorityKpis.map((kpi) => [...kpi.results].sort((a, b) => (a.dimensions?.priority || '').localeCompare(b.dimensions?.priority || '', undefined, { numeric: true })).map((result: KpiCalcResult['results'][0], idx: number) => {
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
                    <div className="flex items-center justify-between mb-2"><Badge variant="outline" className="text-xs">{result.dimensions?.priority}</Badge><span className={`text-lg font-bold ${result.value >= 80 ? 'text-emerald-400' : result.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{result.value.toFixed(1)}{result.unit || '%'}</span></div>
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
            )}
          </Card>
        )}

        {otherPriorityKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Ticket className="h-5 w-5 text-amber-500" />
                    Tickets by Priority
                  </CardTitle>
                  <button
                    onClick={() => setOtherPriorityPanelExpanded(!otherPriorityPanelExpanded)}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                    title={otherPriorityPanelExpanded ? "Collapse" : "Expand"}
                    aria-label={otherPriorityPanelExpanded ? "Collapse section" : "Expand section"}
                  >
                    {otherPriorityPanelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
                {otherPriorityKpis.some(kpi => Array.from(hiddenDimensions).some(k => k.startsWith(`${kpi.pluginId}|`))) && (
                  <Button variant="ghost" size="sm" onClick={() => {
                    setHiddenDimensions((prev: Set<string>) => {
                      const next = new Set(prev);
                      otherPriorityKpis.forEach(kpi => {
                        next.forEach(k => { if (k.startsWith(`${kpi.pluginId}|`)) next.delete(k); });
                      });
                      return next;
                    });
                  }} className="h-7 text-[10px] text-amber-400 hover:text-amber-500 hover:bg-amber-500/10">
                    <RotateCw className="h-3 w-3 mr-1" /> Restore All
                  </Button>
                )}
              </div>
            </CardHeader>
            {otherPriorityPanelExpanded && (
              <CardContent>
                <div className="space-y-4">{otherPriorityKpis.map((kpi) => {
                  const visibleResults = kpi.results
                    .filter((r: KpiCalcResult['results'][0]) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.priority || r.name}`))
                    .sort((a, b) => {
                      const pA = a.dimensions?.priority || a.name;
                      const pB = b.dimensions?.priority || b.name;
                      return pA.localeCompare(pB, undefined, { numeric: true, sensitivity: 'base' });
                    });
                  const maxVal = Math.max(...visibleResults.map((r: KpiCalcResult['results'][0]) => r.value), 1);

                  return (
                    <div key={kpi.pluginId} className="space-y-3">
                      {visibleResults.map((result: KpiCalcResult['results'][0], idx: number) => (
                        <div key={`${kpi.pluginId}-${idx}`} className="space-y-1 group">
                          <div className="flex items-center justify-between text-sm">
                            <div className="flex items-center gap-2">
                              <span
                                className="text-slate-700 dark:text-slate-300 font-medium cursor-pointer hover:text-blue-500 hover:underline"
                                onClick={() => handleDrillDown(result.ticketKeys || [], `${result.name} - ${result.dimensions?.priority}`)}
                              >
                                {result.dimensions?.priority || result.name}
                              </span>
                              <button
                                onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.priority || result.name)}
                                className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                                title="Hide bar"
                              >
                                <EyeOff className="h-3 w-3" />
                              </button>
                            </div>
                            <span className="font-mono font-bold text-amber-500">{result.value} {result.unit}</span>
                          </div>
                          <div
                            className="h-2.5 rounded-full bg-gray-100 dark:bg-slate-800 overflow-hidden cursor-pointer hover:ring-1 hover:ring-amber-400 transition-all"
                            onClick={() => handleDrillDown(result.ticketKeys || [], `${result.name} - ${result.dimensions?.priority}`)}
                          >
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-700"
                              style={{ width: `${(result.value / maxVal) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}</div>
              </CardContent>
            )}
          </Card>
        )}

        {slaStatusKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-emerald-400" />SLA by Status</CardTitle>
                  <button
                    onClick={() => setStatusSlaPanelExpanded(!statusSlaPanelExpanded)}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                    title={statusSlaPanelExpanded ? "Collapse" : "Expand"}
                    aria-label={statusSlaPanelExpanded ? "Collapse section" : "Expand section"}
                  >
                    {statusSlaPanelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
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
            {statusSlaPanelExpanded && (
              <CardContent className="space-y-8">
                {slaStatusKpis.map((kpi) => (
                  <div key={kpi.pluginId} className="space-y-3">
                    {slaStatusKpis.length > 1 && (
                      <div className="flex items-center gap-2 px-1">
                        <Badge variant="secondary" className="text-[10px] uppercase font-bold tracking-wider py-0 h-4">
                          {kpi.pluginId === 'sla_by_status_excl_clone' ? 'Excl. Clones' : 'Standard'}
                        </Badge>
                        <div className="h-px flex-1 bg-slate-100 dark:bg-slate-800" />
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 print-grid-3">
                      {kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
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
                            <div className="flex items-center justify-between mb-2"><Badge variant="outline" className="text-xs">{result.dimensions?.status}</Badge><span className={`text-lg font-bold ${result.value >= 80 ? 'text-emerald-400' : result.value >= 50 ? 'text-amber-400' : 'text-red-400'}`}>{result.value.toFixed(1)}{result.unit || '%'}</span></div>
                            {result.details && (
                              <div className="space-y-1 mt-2">
                                <div className="flex justify-between text-xs text-slate-500"><span>Target:</span><span className="font-mono">{result.details.find((d: any) => d.label === 'Target')?.value || '-'}h</span></div>
                                <div className="flex justify-between text-xs text-slate-500"><span>Within SLA:</span><span className="font-mono">{result.details.find((d: any) => d.label === 'Within SLA')?.value || 0}/{result.details.find((d: any) => d.label === 'Total')?.value || 0}</span></div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </CardContent>
            )}
          </Card>
        )}

        {assigneeKpis.length > 0 && (
          <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <UserCheck className="h-5 w-5 text-indigo-400" />
                    Tickets by Assignee
                  </CardTitle>
                  <button
                    onClick={() => setAssigneePanelExpanded(!assigneePanelExpanded)}
                    className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                    title={assigneePanelExpanded ? "Collapse" : "Expand"}
                    aria-label={assigneePanelExpanded ? "Collapse section" : "Expand section"}
                  >
                    {assigneePanelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                  </button>
                </div>
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
            {assigneePanelExpanded && (
              <CardContent>
                <div className="space-y-4">{assigneeKpis.map((kpi) => {
                  const visibleResults = kpi.results.filter((r: KpiCalcResult['results'][0]) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.assignee || r.name}`));
                  const maxVal = Math.max(...visibleResults.map((r: KpiCalcResult['results'][0]) => r.value), 1);

                  return (
                    <div key={kpi.pluginId} className="space-y-3">
                      {visibleResults.map((result: KpiCalcResult['results'][0], idx: number) => (
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
            )}
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
                      onMoveUp={handleMoveChart ? (id) => handleMoveChart(id, 'up') : undefined}
                      onMoveDown={handleMoveChart ? (id) => handleMoveChart(id, 'down') : undefined}
                      onClick={handleDrillDown}
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
                  onClick={handleAddChart}
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
          <div className="flex-1 overflow-hidden">
            {drillDownKeys && (
              <Virtuoso
                style={{ height: '100%' }}
                totalCount={drillDownKeys.length}
                itemContent={(index) => {
                  const key = drillDownKeys[index];
                  const issue = (masterDatasetInfo?.issues || []).find((i: any) => i.key === key);
                  if (!issue) return null;

                  const activeConnection = connections.find((c: any) => c.id === activeConnectionId);
                  const baseUrl = activeConnection?.baseUrl || '';
                  const formattedBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
                  const jiraUrl = activeConnection ? `${formattedBaseUrl}/browse/${issue.key}` : '#';

                  return (
                    <div className="px-4 pb-3">
                      <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 group hover:border-blue-500/30 transition-all">
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
                    </div>
                  );
                }}
              />
            )}
          </div>
        </SheetContent>
      </Sheet>

      <AnimatePresence>
        {showFloatingBar && !drillDownKeys && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-0 left-1/2 -translate-x-1/2 z-[60] w-full max-w-xl px-4 pb-4"
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
                      <div
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 transition-colors"
                        onClick={() => {
                          setFilterPanelOpen(true);
                          setTimeout(() => {
                            document.querySelector('[data-filter-section]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }}
                      >
                        <Sliders className="h-3.5 w-3.5 text-emerald-500" />
                        {Object.values(globalFilters).flat().length} Filters
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-2xl max-w-xs z-[70]" hideArrow={true}>
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
                <Separator orientation="vertical" className="h-4 bg-slate-200 dark:bg-slate-800" />
                <TooltipProvider delayDuration={0}>
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <div
                        className="flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 cursor-pointer rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 transition-colors"
                        onClick={() => {
                          setActiveTab('kpi');
                          setKpiSubTab('plugins');
                          setTimeout(() => {
                            document.querySelector('[data-plugins-section]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }, 100);
                        }}
                      >
                        <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                        {sortedKpiResults.length} Plugins
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="p-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-slate-200 dark:border-slate-800 shadow-2xl max-w-xs z-[70] rounded-lg" sideOffset={8} hideArrow={true}>
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">Active Plugins</p>
                        {sortedKpiResults.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {sortedKpiResults.map(p => (
                              <Badge key={p.pluginId} variant="secondary" className="text-[9px] py-0 h-4 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 border-none">
                                {p.pluginId}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 italic">No active plugins</p>
                        )}
                      </div>
                    </TooltipContent>
                  </UITooltip>
                </TooltipProvider>
              </div>
              <div className="flex items-center gap-1.5 pr-1.5">
                <Button
                  size="sm"
                  className="rounded-full h-8 px-4 bg-emerald-600 hover:bg-emerald-700 text-xs font-bold shadow-lg shadow-emerald-600/20 gap-2"
                  onClick={() => {
                    hasUserInitiatedCalc.current = true;
                    runCalculation();
                    toast.info('Recalculating KPIs...');
                  }}
                  disabled={calculating}
                >
                  <RefreshCw className={`h-3 w-3 ${calculating ? 'animate-spin' : ''}`} />
                  Update
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full w-8 h-8 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  <ArrowUp className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
