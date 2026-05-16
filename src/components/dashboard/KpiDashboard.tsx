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
import { getIssueOwnerTeamField } from '@/lib/jira/field-config';
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
import { localConfig, type SavedJql, type KpiPlugin } from '@/lib/config/local-store';
import { ChartConfig, KpiCalcResult } from '@/types/dashboard';
import { JqlAutocomplete } from './JqlAutocomplete';
import { useAppStore } from '@/store/app-store';
import { useDrillDown } from '@/hooks/useDrillDown';
import { usePeriodAnalysis } from '@/hooks/usePeriodAnalysis';
import { usePluginVisibility } from '@/hooks/usePluginVisibility';
import { useJqlFilters } from '@/hooks/useJqlFilters';
import { useKpiCalculations } from '@/hooks/useKpiCalculations';
import { useWidgetOrder } from '@/hooks/useWidgetOrder';

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
    kpiCardConfigs, setKpiCardConfigs,
    activeView, setIsViewModified, setActiveView,
    widgetTitles, setWidgetTitles
  } = useAppStore();

  const onPrint = () => window.print();
  const isFirstRender = useRef(true);
  const hasUserInitiatedCalc = useRef(false);

  // State for panel expansion
  const [assigneePanelExpanded, setAssigneePanelExpanded] = useState(true);
  const [statusTimePanelExpanded, setStatusTimePanelExpanded] = useState(true);
  const [openTicketsByStatusPanelExpanded, setOpenTicketsByStatusPanelExpanded] = useState(true);
  const [prioritySlaPanelExpanded, setPrioritySlaPanelExpanded] = useState(true);
  const [otherPriorityPanelExpanded, setOtherPriorityPanelExpanded] = useState(true);
  const [statusSlaPanelExpanded, setStatusSlaPanelExpanded] = useState(true);

  // Plugin registry for names
  const [pluginRegistry, setPluginRegistry] = useState<Record<string, KpiPlugin>>({});

  // Get plugin name from registry or fallback to pluginId
  const getPluginName = useCallback((pluginId: string): string => {
    return pluginRegistry[pluginId]?.name || pluginId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  }, [pluginRegistry]);

  // ─── Editing State for JQL Filters ─────────────────────────────────────────────
  const [editingJqlId, setEditingJqlId] = useState<string | null>(null);
  const [jqlToDelete, setJqlToDelete] = useState<string | null>(null);

  // Drill-down state extracted to useDrillDown hook
  const { drillDownKeys, drillDownTitle, isDrillDownOpen, openDrillDown, closeDrillDown } = useDrillDown();

  // ─── Period Analysis Hook ───────────────────────────────────────────────────
  const periodAnalysis = usePeriodAnalysis(
    dateFrom ? new Date(dateFrom) : new Date(),
    dateTo ? new Date(dateTo) : new Date(),
    masterDatasetInfo
  );

  // ─── JQL Filters Hook ────────────────────────────────────────────────────────
  const jqlFilters = useJqlFilters();

  // ─── Plugin Visibility Hook ───────────────────────────────────────────────────
  const allPluginIds = useMemo(() => kpiResults.map(kpi => kpi.pluginId), [kpiResults]);
  const pluginVisibility = usePluginVisibility(allPluginIds, 'cfg_active_plugins');
  const { widgetOrder } = useWidgetOrder();

  // Fetch plugin metadata for correct names
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        const customPlugins = localConfig.getKpiPlugins();
        let allPlugins = [...customPlugins];
        try {
          const res = await fetch('/api/kpi/plugins');
          const data = await res.json();
          if (data.success && data.plugins) {
            const customIds = new Set(customPlugins.map(p => p.id));
            const builtins = data.plugins.filter((p: KpiPlugin) => !customIds.has(p.id));
            allPlugins = [...allPlugins, ...builtins];
          }
        } catch (err) {
          console.error('Failed to fetch built-in plugins:', err);
        }

        // Create plugin ID to name mapping
        const registry: Record<string, KpiPlugin> = {};
        allPlugins.forEach((plugin: KpiPlugin) => {
          registry[plugin.id] = plugin;
        });
        setPluginRegistry(registry);
      } catch (err) {
        console.error('Failed to load plugin registry:', err);
      }
    };

    fetchPlugins();
  }, []);

  // ─── KPI Calculations Hook ────────────────────────────────────────────────────
  const kpiCalculations = useKpiCalculations(
    dateFrom ? new Date(dateFrom) : new Date(),
    dateTo ? new Date(dateTo) : new Date(),
    globalFilters
  );

  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  const jqlInputRef = useRef<HTMLInputElement>(null);

  // Removed: setDashboardJqls and activePluginsOrder loading - now handled by useJqlFilters and usePluginVisibility hooks

  const lastSaveRequestId = useRef(0);

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
        const requestId = ++lastSaveRequestId.current;
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
            
            // Only update state if this is still the latest request
            if (data.success && requestId === lastSaveRequestId.current) {
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
    jqlFilters.toggleStagingFilter(key, value);
    // Mark view as modified when filters change
    setIsViewModified(true);
  };

  const handleApplyFilters = () => {
    hasUserInitiatedCalc.current = true;
    isApplyingUserFiltersRef.current = true;
    setGlobalFilters(jqlFilters.stagingFilters);
    // Update last synced state to prevent immediate re-sync
    lastSyncedGlobalFiltersRef.current = jqlFilters.stagingFilters;
    // Reset flag after a brief delay to allow the state to update
    setTimeout(() => {
      isApplyingUserFiltersRef.current = false;
    }, 100);
    toast.success('Filters applied');
  };

  const handleUpdateFilter = (key: string, value: string) => {
    jqlFilters.toggleStagingFilter(key, value);
  };

  // Track if we're applying user filters to avoid sync loops
  const isApplyingUserFiltersRef = useRef(false);

  // Track the last synced globalFilters to detect actual changes
  const lastSyncedGlobalFiltersRef = useRef<Record<string, string[]> | null>(null);

  // Sync stagingFilters with globalFilters when globalFilters changes externally (e.g., view loading, page refresh)
  useEffect(() => {
    // Only sync if this is not a user-initiated filter application
    if (!isApplyingUserFiltersRef.current) {
      // Check if globalFilters actually changed from last sync
      const globalFiltersJson = JSON.stringify(globalFilters);
      const lastSyncedJson = JSON.stringify(lastSyncedGlobalFiltersRef.current);

      if (globalFiltersJson !== lastSyncedJson) {
        // Clear staging filters and sync with globalFilters
        jqlFilters.clearStagingFilters();
        Object.entries(globalFilters).forEach(([key, values]) => {
          values.forEach(value => {
            jqlFilters.toggleStagingFilter(key, value);
          });
        });

        // Update last synced state
        lastSyncedGlobalFiltersRef.current = globalFilters;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalFilters]); // Only depend on globalFilters, not jqlFilters object

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
    openDrillDown(keys, title);
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
    // Use activePlugins from usePluginVisibility hook
    const activeOrder = pluginVisibility.activePlugins;

    // If never configured (all plugins active), show all in original order
    if (activeOrder.length === kpiResults.length) {
      return kpiResults;
    }

    // If explicitly none selected
    if (activeOrder.length === 0) return [];

    // Sort by active plugin order
    return [...kpiResults].sort((a, b) => {
      const idxA = activeOrder.indexOf(a.pluginId);
      const idxB = activeOrder.indexOf(b.pluginId);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [kpiResults, pluginVisibility.activePlugins]);

  const mainKpis = sortedKpiResults.filter((r: KpiCalcResult) => !r.results[0]?.dimensions?.status && !r.results[0]?.dimensions?.priority && !r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  // @MX:NOTE: Widget Order Mapping - Maps widget display order IDs to their corresponding KPI groups
  // @MX:REASON: Groups plugins by dimension type for organized dashboard rendering
  const widgetOrderMapping = useMemo(() => {
    const mapping: Record<string, { kpis: KpiCalcResult[]; component: string }> = {};

    // Group by dimension type, not by artificial panels
    sortedKpiResults.forEach((kpiResult) => {
      const { pluginId, results } = kpiResult;
      if (!results[0]) return;

      const dimension = results[0].dimensions;
      if (!dimension) return;

      // Determine component type based on dimension
      let componentType: string;
      if (dimension.status) {
        componentType = pluginId === 'time_in_status' ? 'status-time' : 'status-open';
      } else if (dimension.priority && pluginId === 'sla_by_priority') {
        componentType = 'sla-priority';
      } else if (dimension.priority) {
        componentType = 'other-priority';
      } else if (dimension.assignee) {
        componentType = 'assignee';
      } else {
        componentType = 'main';
      }

      // Create widget key based on plugin ID (individual plugins, not panels)
      const widgetKey = `plugin-${pluginId}`;
      if (!mapping[widgetKey]) {
        mapping[widgetKey] = { kpis: [], component: componentType };
      }
      mapping[widgetKey].kpis.push(kpiResult);
    });

    return mapping;
  }, [sortedKpiResults]);

  // Filter widget order to only include plugins that exist and have data
  const orderedWidgets = useMemo(() => {
    return widgetOrder
      .filter(id => {
        // Only include individual plugins that exist in the mapping
        if (id.startsWith('plugin-')) {
          const widget = widgetOrderMapping[id];
          return widget && widget.kpis.length > 0;
        }
        return false; // No more artificial panels
      })
      .map(id => ({
        id,
        ...widgetOrderMapping[id]
      }));
  }, [widgetOrder, widgetOrderMapping]);

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

  // Helper function to extract value from Jira select fields
  const extractSelectFieldValue = (field: any): string | null => {
    if (!field) return null;
    if (typeof field === 'string') return field;
    if (typeof field === 'object' && field.value) return field.value;
    return null;
  };

  const filterOptions = useMemo(() => {
    const issueOwnerTeamField = getIssueOwnerTeamField();
    const options = { project: new Set<string>(), assignee: new Set<string>(), priority: new Set<string>(), issueType: new Set<string>(), status: new Set<string>(), component: new Set<string>(), label: new Set<string>(), issueOwnerTeam: new Set<string>() };
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
        if (f[issueOwnerTeamField]) {
          // Jira select fields return objects: { value: "Team Name", id: "123" }
          const teamValue = extractSelectFieldValue(f[issueOwnerTeamField]);
          if (teamValue) {
            options.issueOwnerTeam.add(teamValue);
            console.log(`[Filter Debug] Issue ${i.key} has Issue Owner Team (${issueOwnerTeamField}): ${teamValue}`);
          }
        }
      });
    }
    console.log(`[Filter Debug] Total unique Issue Owner Teams: ${options.issueOwnerTeam.size}`, Array.from(options.issueOwnerTeam));
    return { project: Array.from(options.project).sort(), assignee: Array.from(options.assignee).sort(), priority: Array.from(options.priority).sort(), issueType: Array.from(options.issueType).sort(), status: Array.from(options.status).sort(), component: Array.from(options.component).sort(), label: Array.from(options.label).sort(), issueOwnerTeam: Array.from(options.issueOwnerTeam).sort() };
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
                {periodAnalysis.requiresTruncation && (
                  <UITooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="h-4 py-0 text-[9px] border-amber-500/30 text-amber-500 gap-1 animate-pulse cursor-help">
                        <AlertTriangle className="h-2.5 w-2.5" /> Data Truncated
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs p-3 shadow-lg border-amber-200 dark:border-amber-800">
                      <p className="text-xs">
                        Your selected analysis starts on <strong className="text-amber-600 dark:text-amber-400">{new Date(dateFrom).toLocaleDateString()}</strong>, but your local dataset only contains data from <strong className="text-amber-600 dark:text-amber-400">{periodAnalysis.availableStartDate ? new Date(periodAnalysis.availableStartDate).toLocaleDateString() : 'N/A'}</strong> onwards.<br /><br />
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
                  jqlFilters.clearStagingFilters();
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
                          const oldJql = jqlFilters.jqlList.find(j => j.id === editingJqlId);
                          jqlFilters.editJql(editingJqlId, jqlQuery, oldJql?.name || 'Saved JQL');
                          setEditingJqlId(null);
                          setJqlQuery('');
                          toast.success('Filter updated');

                        } else {
                          const id = `djql-${Date.now()}`;
                          const newQuery = jqlQuery;
                          jqlFilters.addJql(newQuery, newQuery);
                          setJqlQuery('');
                          toast.success('Filter saved to dashboard');

                          jqlFilters.toggleStagingFilter('jql', newQuery);
                          setIsViewModified(true);
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

                  {jqlFilters.jqlList.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                      {jqlFilters.jqlList.map(djql => {
                        const isActive = jqlFilters.stagingFilters['jql']?.includes(djql.query);
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
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setJqlToDelete(djql.id);
                                      }}
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
                                            const queryToDelete = jqlFilters.jqlList.find(j => j.id === jqlToDelete)?.query;
                                            jqlFilters.deleteJql(jqlToDelete);
                                            if (queryToDelete && jqlFilters.stagingFilters['jql']?.includes(queryToDelete)) {
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
                    { label: 'Issue Owner Team', key: 'issueOwnerTeam', options: filterOptions.issueOwnerTeam },
                  ].filter(f => f.options.length >= 1).map(filter => (
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
                              {jqlFilters.stagingFilters[filter.key]?.length
                                ? `${jqlFilters.stagingFilters[filter.key].length} selected`
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
                                <Checkbox checked={!!jqlFilters.stagingFilters[filter.key]?.includes(opt)} onCheckedChange={() => { }} />
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
                    disabled={(() => {
                      // Check if staging filters have any content different from global filters
                      const stagingKeys = Object.keys(jqlFilters.stagingFilters);
                      const globalKeys = Object.keys(globalFilters);

                      // Enable if key count differs
                      if (stagingKeys.length !== globalKeys.length) return false;

                      // Enable if any values differ
                      for (const key of stagingKeys) {
                        const stagingVals = jqlFilters.stagingFilters[key] || [];
                        const globalVals = globalFilters[key] || [];

                        if (stagingVals.length !== globalVals.length) return false;

                        // Check if all values match
                        const hasAllValues = stagingVals.every(v => globalVals.includes(v));
                        if (!hasAllValues) return false;
                      }

                      // If we get here, they're the same - disable button
                      return true;
                    })()}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Apply Filters
                  </Button>
                </div>
              </div>

              {Object.keys(jqlFilters.stagingFilters).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {(Object.entries(jqlFilters.stagingFilters) as [string, string[]][]).map(([key, values]) => (
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

        {/* Ordered Widgets Section - follows widget display order */}
        {orderedWidgets.length > 0 && (
          <div className="space-y-4">
            {orderedWidgets.map((widget) => {
              switch (widget.component) {
                case 'status-time':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi) => (
                    <Card key={`status-time-${kpi.pluginId}`} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
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
                            }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                              <RotateCw className="h-3 w-3 mr-1" /> Restore All
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {statusTimePanelExpanded && (
                        <CardContent>
                        <div className="space-y-3">{kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                          const dimKey = `${kpi.pluginId}|${result.dimensions?.status || result.name}`;
                          if (hiddenDimensions.has(dimKey)) return null;

                          return (
                            <div key={idx} className="space-y-1 group">
                              <div className="flex items-center justify-between text-sm">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                                    onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                                  >
                                    {result.name}
                                  </span>
                                  <button
                                    onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.status || result.name)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                                  >
                                    <EyeOff className="h-3.5 w-3.5" />
                                  </button>
                                </div>
                                <span className="text-slate-500 dark:text-slate-400 text-xs">{result.value} {result.unit}</span>
                              </div>
                              <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                  className="absolute h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-300"
                                  style={{ width: `${Math.min(100, (result.value / 120) * 100)}%` }}
                                />
                              </div>
                            </div>
                          );
                        })}</div>
                        {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status || r.name}`)) && (
                          <div className="text-xs text-slate-400 italic">
                            {Array.from(hiddenDimensions).filter(k => k.startsWith('time_in_status|')).length} status(es) hidden
                          </div>
                        )}
                        </CardContent>
                      )}
                    </Card>
                  )) : null;

                case 'status-open':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi) => (
                    <Card key={`status-open-${kpi.pluginId}`} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-emerald-400" />Open Tickets by Status</CardTitle>
                            <button
                              onClick={() => setOpenTicketsByStatusPanelExpanded(!openTicketsByStatusPanelExpanded)}
                              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                              title={openTicketsByStatusPanelExpanded ? "Collapse" : "Expand"}
                              aria-label={openTicketsByStatusPanelExpanded ? "Collapse section" : "Expand section"}
                            >
                              {openTicketsByStatusPanelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {Array.from(hiddenDimensions).some(k => k.startsWith('open_tickets_by_status|')) && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setHiddenDimensions((prev: Set<string>) => {
                                const next = new Set(prev);
                                next.forEach(k => { if (k.startsWith('open_tickets_by_status|')) next.delete(k); });
                                return next;
                              });
                            }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                              <RotateCw className="h-3 w-3 mr-1" /> Restore All
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {openTicketsByStatusPanelExpanded && (
                        <CardContent>
                        {/* Age Legend */}
                        <div className="flex items-center gap-4 mb-4 pb-3 border-b border-slate-200 dark:border-slate-700">
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
                              const visibleResults = results.filter((r) => !hiddenDimensions.has(`open_tickets_by_status|${r.dimensions?.ageCategory ? `${status}-${r.dimensions.ageCategory}` : status}`));
                              if (visibleResults.length === 0) return null;

                              const totalValue = visibleResults.reduce((sum, r) => sum + r.value, 0);

                              return (
                                <div key={status} className="space-y-2 group">
                                  {/* Status Header */}
                                  <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                                        onClick={() => {
                                          // Gather all ticket keys for this status across all age categories
                                          const allTicketKeys = visibleResults.flatMap(r => r.ticketKeys || []);
                                          handleDrillDown(allTicketKeys, `Status: ${status} (All)`);
                                        }}
                                        title="Click to see all tickets for this status"
                                      >
                                        {status}
                                      </span>
                                      <span className="text-xs text-slate-500 dark:text-slate-400">({totalValue} tickets)</span>
                                    </div>
                                    <button
                                      onClick={() => {
                                        // Hide all age categories for this status
                                        const dimsToAdd = [`open_tickets_by_status|${status}-existing`, `open_tickets_by_status|${status}-last_week`, `open_tickets_by_status|${status}-this_week`];
                                        setHiddenDimensions((prev: Set<string>) => {
                                          const next = new Set(prev);
                                          dimsToAdd.forEach(d => next.add(d));
                                          return next;
                                        });
                                      }}
                                      className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                                      title="Hide this status"
                                    >
                                      <EyeOff className="h-3.5 w-3.5" />
                                    </button>
                                  </div>

                                  {/* Stacked/Segmented Bar */}
                                  <div className="space-y-1">
                                    <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                      {visibleResults
                                        .sort((a, b) => {
                                          // Sort by age: existing → last_week → this_week
                                          const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
                                          const ageA = ageOrder[a.dimensions?.ageCategory as string] ?? 999;
                                          const ageB = ageOrder[b.dimensions?.ageCategory as string] ?? 999;
                                          return ageA - ageB;
                                        })
                                        .map((result, idx) => {
                                          const width = totalValue > 0 ? (result.value / totalValue) * 100 : 0;
                                          const ageCategory = result.dimensions?.ageCategory as string;
                                          const colorClass = ageColors[ageCategory] || 'bg-slate-400';

                                          return (
                                            <div
                                              key={idx}
                                              className={`${colorClass} hover:opacity-80 transition-opacity cursor-pointer`}
                                              style={{ width: `${width}%` }}
                                              onClick={() => handleDrillDown(result.ticketKeys || [], `${status} (${result.dimensions?.ageCategory})`)}
                                              title={`${result.dimensions?.ageCategory}: ${result.value} tickets`}
                                            />
                                          );
                                        })}
                                    </div>

                                    {/* Age Category Breakdown */}
                                    <div className="flex gap-2 flex-wrap">
                                      {visibleResults
                                        .sort((a, b) => {
                                          const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
                                          const ageA = ageOrder[a.dimensions?.ageCategory as string] ?? 999;
                                          const ageB = ageOrder[b.dimensions?.ageCategory as string] ?? 999;
                                          return ageA - ageB;
                                        })
                                        .map((result, idx) => {
                                          const ageCategory = result.dimensions?.ageCategory as string;
                                          const colorClass = ageColors[ageCategory] || 'bg-slate-400';

                                          return (
                                            <div key={idx} className="flex items-center gap-1 text-xs">
                                              <div className={`w-2 h-2 rounded ${colorClass}`} />
                                              <span className="text-slate-600 dark:text-slate-400">
                                                {result.dimensions?.ageCategory === 'this_week' ? 'This week' :
                                                 result.dimensions?.ageCategory === 'last_week' ? '1 week' : '2+ weeks'}: {result.value}
                                              </span>
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
                        {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.has(`open_tickets_by_status|${r.dimensions?.ageCategory ? `${r.dimensions?.status}-${r.dimensions.ageCategory}` : r.dimensions?.status || r.name}`)) && (
                          <div className="text-xs text-slate-400 italic mt-2">
                            {Array.from(hiddenDimensions).filter(k => k.startsWith('open_tickets_by_status|')).length} age category(es) hidden
                          </div>
                        )}
                        </CardContent>
                      )}
                    </Card>
                  )) : null;

                case 'sla-priority':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <Card key={`sla-priority-${kpi.pluginId}-${kpiIdx}`} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
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
                          {Array.from(hiddenDimensions).some(k => k.startsWith(kpi.pluginId + '|')) && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setHiddenDimensions((prev: Set<string>) => {
                                const next = new Set(prev);
                                next.forEach(k => { if (k.startsWith(kpi.pluginId + '|')) next.delete(k); });
                                return next;
                              });
                            }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                              <RotateCw className="h-3 w-3 mr-1" /> Restore All
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {prioritySlaPanelExpanded && (
                        <CardContent>
                          <div className="space-y-3">
                            {kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                              const dimKey = `${kpi.pluginId}|${result.dimensions?.priority || result.name}`;
                              if (hiddenDimensions.has(dimKey)) return null;

                              const priority = result.dimensions?.priority || result.name;
                              const priorityColor: Record<string, string> = {
                                'Highest': 'bg-red-500',
                                'High': 'bg-orange-500',
                                'Medium': 'bg-amber-500',
                                'Low': 'bg-blue-500',
                                'Lowest': 'bg-cyan-500',
                              };

                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                                        onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                                      >
                                        {result.name}
                                      </span>
                                      <Badge className="text-[9px] py-0 h-3.5 px-1.5 border border-slate-300 dark:border-slate-600">
                                        {result.comparison?.label || 'No Target'}
                                      </Badge>
                                      <button
                                        onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.priority || result.name)}
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
                          {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.priority || r.name}`)) && (
                            <div className="text-xs text-slate-400 italic">
                              {Array.from(hiddenDimensions).filter(k => k.startsWith(kpi.pluginId + '|')).length} priorit(y/ies) hidden
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )) : null;

                case 'other-priority':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <Card key={`other-priority-${kpi.pluginId}-${kpiIdx}`} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="flex items-center gap-2">
                              <TrendingUp className="h-5 w-5 text-cyan-400" />
                              {getPluginName(kpi.pluginId)}
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
                          {Array.from(hiddenDimensions).some(k => k.startsWith(kpi.pluginId + '|')) && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setHiddenDimensions((prev: Set<string>) => {
                                const next = new Set(prev);
                                next.forEach(k => { if (k.startsWith(kpi.pluginId + '|')) next.delete(k); });
                                return next;
                              });
                            }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                              <RotateCw className="h-3 w-3 mr-1" /> Restore All
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {otherPriorityPanelExpanded && (
                        <CardContent>
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
                                const visibleResults = results.filter((r) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.priority ? `${priority}-${r.dimensions.ageCategory}` : priority}`));
                                if (visibleResults.length === 0) return null;

                                const totalValue = visibleResults.reduce((sum, r) => sum + r.value, 0);

                                return (
                                  <div key={priority} className="space-y-2 group">
                                    {/* Priority Header */}
                                    <div className="flex items-center justify-between text-sm">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                                          onClick={() => {
                                            // Gather all ticket keys for this priority across all age categories
                                            const allTicketKeys = visibleResults.flatMap(r => r.ticketKeys || []);
                                            handleDrillDown(allTicketKeys, `Priority: ${priority} (All)`);
                                          }}
                                          title="Click to see all tickets for this priority"
                                        >
                                          {priority}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">({totalValue} tickets)</span>
                                      </div>
                                      <button
                                        onClick={() => {
                                          // Hide all age categories for this priority
                                          const dimsToAdd = [`${kpi.pluginId}|${priority}-existing`, `${kpi.pluginId}|${priority}-last_week`, `${kpi.pluginId}|${priority}-this_week`];
                                          setHiddenDimensions((prev: Set<string>) => {
                                            const next = new Set(prev);
                                            dimsToAdd.forEach(d => next.add(d));
                                            return next;
                                          });
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                                        title="Hide this priority"
                                      >
                                        <EyeOff className="h-3.5 w-3.5" />
                                      </button>
                                    </div>

                                    {/* Stacked/Segmented Bar */}
                                    <div className="space-y-1">
                                      <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                        {visibleResults
                                          .sort((a, b) => {
                                            // Sort by age: existing → last_week → this_week
                                            const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
                                            const ageA = ageOrder[a.dimensions?.ageCategory as string] ?? 999;
                                            const ageB = ageOrder[b.dimensions?.ageCategory as string] ?? 999;
                                            return ageA - ageB;
                                          })
                                          .map((result, idx) => {
                                            const width = totalValue > 0 ? (result.value / totalValue) * 100 : 0;
                                            const ageCategory = result.dimensions?.ageCategory as string;
                                            const colorClass = ageColors[ageCategory] || 'bg-slate-400';

                                            return (
                                              <div
                                                key={idx}
                                                className={`${colorClass} hover:opacity-80 transition-opacity cursor-pointer`}
                                                style={{ width: `${width}%` }}
                                                onClick={() => handleDrillDown(result.ticketKeys || [], `${priority} (${result.dimensions?.ageCategory})`)}
                                                title={`${result.dimensions?.ageCategory}: ${result.value} tickets`}
                                              />
                                            );
                                          })}
                                      </div>

                                      {/* Age Category Breakdown */}
                                      <div className="flex gap-2 flex-wrap">
                                        {visibleResults
                                          .sort((a, b) => {
                                            const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
                                            const ageA = ageOrder[a.dimensions?.ageCategory as string] ?? 999;
                                            const ageB = ageOrder[b.dimensions?.ageCategory as string] ?? 999;
                                            return ageA - ageB;
                                          })
                                          .map((result, idx) => {
                                            const ageCategory = result.dimensions?.ageCategory as string;
                                            const ageLabel: Record<string, string> = {
                                              'existing': '2+ weeks',
                                              'last_week': '1 week',
                                              'this_week': 'This week',
                                            };
                                            const colorClass = ageColors[ageCategory] || 'bg-slate-400';

                                            return (
                                              <div key={idx} className="flex items-center gap-1.5 text-xs">
                                                <div className={`w-2.5 h-2.5 rounded-sm ${colorClass}`} />
                                                <span className="text-slate-600 dark:text-slate-400">
                                                  {ageLabel[ageCategory] || ageCategory}: {result.value}
                                                </span>
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
                          {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.priority || r.name}`)) && (
                            <div className="text-xs text-slate-400 italic">
                              {Array.from(hiddenDimensions).filter(k => k.startsWith(kpi.pluginId + '|')).length} priorit(y/ies) hidden
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )) : null;

                case 'sla-status':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <Card key={`sla-status-${kpi.pluginId}-${kpiIdx}`} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="flex items-center gap-2">
                              <Target className="h-5 w-5 text-emerald-400" />
                              {kpi.pluginId === 'sla_by_status_excl_clone' ? 'SLA by Status (Excl. Clones)' : 'SLA by Status'}
                            </CardTitle>
                            <button
                              onClick={() => setStatusSlaPanelExpanded(!statusSlaPanelExpanded)}
                              className="text-slate-400 hover:text-slate-600 transition-colors p-0.5"
                              title={statusSlaPanelExpanded ? "Collapse" : "Expand"}
                              aria-label={statusSlaPanelExpanded ? "Collapse section" : "Expand section"}
                            >
                              {statusSlaPanelExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                          {Array.from(hiddenDimensions).some(k => k.startsWith(kpi.pluginId + '|')) && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setHiddenDimensions((prev: Set<string>) => {
                                const next = new Set(prev);
                                next.forEach(k => { if (k.startsWith(kpi.pluginId + '|')) next.delete(k); });
                                return next;
                              });
                            }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                              <RotateCw className="h-3 w-3 mr-1" /> Restore All
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {statusSlaPanelExpanded && (
                        <CardContent>
                          <div className="space-y-3">
                            {kpi.results.map((result: KpiCalcResult['results'][0], idx: number) => {
                              const dimKey = `${kpi.pluginId}|${result.dimensions?.status || result.name}`;
                              if (hiddenDimensions.has(dimKey)) return null;

                              const status = result.dimensions?.status || result.name;
                              const statusColor: Record<string, string> = {
                                'Done': 'bg-emerald-500',
                                'Closed': 'bg-slate-500',
                                'Resolved': 'bg-blue-500',
                                'In Progress': 'bg-blue-600',
                                'To Do': 'bg-gray-500',
                                'In Review': 'bg-purple-500',
                              };

                              return (
                                <div key={idx} className="space-y-1">
                                  <div className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2">
                                      <span
                                        className="text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                                        onClick={() => handleDrillDown(result.ticketKeys || [], result.name)}
                                      >
                                        {result.name}
                                      </span>
                                      <Badge className="text-[9px] py-0 h-3.5 px-1.5 border border-slate-300 dark:border-slate-600">
                                        {result.comparison?.label || 'No Target'}
                                      </Badge>
                                      <button
                                        onClick={() => toggleDimension(kpi.pluginId, result.dimensions?.status || result.name)}
                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                                      >
                                        <EyeOff className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                    <span className="text-slate-500 dark:text-slate-400 text-xs">{result.value} {result.unit}</span>
                                  </div>
                                  <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div
                                      className="absolute h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-300"
                                      style={{ width: `${(result.value / Math.max(result.value, result.comparison?.value || 1)) * 100}%` }}
                                    />
                                  </div>
                                  <div className="text-[10px] text-slate-500 text-center">{result.value}h vs {result.comparison?.value || 'N/A'}h target</div>
                                </div>
                              );
                            })}
                          </div>
                          {kpi.results.some((r: KpiCalcResult['results'][0]) => hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.status || r.name}`)) && (
                            <div className="text-xs text-slate-400 italic">
                              {Array.from(hiddenDimensions).filter(k => k.startsWith(kpi.pluginId + '|')).length} status(es) hidden
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )) : null;

                case 'assignee':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <Card key={`assignee-${kpi.pluginId}-${kpiIdx}`} className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50">
                      <CardHeader>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="flex items-center gap-2">
                              <UserCheck className="h-5 w-5 text-indigo-400" />
                              {getPluginName(kpi.pluginId)}
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
                          {Array.from(hiddenDimensions).some(k => k.startsWith(kpi.pluginId + '|')) && (
                            <Button variant="ghost" size="sm" onClick={() => {
                              setHiddenDimensions((prev: Set<string>) => {
                                const next = new Set(prev);
                                next.forEach(k => { if (k.startsWith(kpi.pluginId + '|')) next.delete(k); });
                                return next;
                              });
                            }} className="h-7 text-[10px] text-emerald-400 hover:text-emerald-500 hover:bg-emerald-500/10">
                              <RotateCw className="h-3 w-3 mr-1" /> Restore All
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      {assigneePanelExpanded && (
                        <CardContent>
                          <div className="space-y-3">
                            {(() => {
                              // Group results by assignee or team
                              const isTeam = kpi.pluginId === 'open_tickets_by_issue_owner_team';
                              const dimensionKey = isTeam ? 'team' : 'assignee';
                              const groups: Record<string, KpiCalcResult['results'][0][]> = {};

                              kpi.results.forEach((result: KpiCalcResult['results'][0]) => {
                                const key = result.dimensions?.[dimensionKey] || 'Unknown';
                                if (!groups[key]) {
                                  groups[key] = [];
                                }
                                groups[key].push(result);
                              });

                              // Color mapping for age categories
                              const ageColors: Record<string, string> = {
                                'existing': 'bg-slate-500',
                                'last_week': 'bg-amber-500',
                                'this_week': 'bg-emerald-400',
                              };

                              return Object.entries(groups).map(([key, results]) => {
                                const visibleResults = results.filter((r) => !hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.[dimensionKey] ? `${key}-${r.dimensions.ageCategory}` : key}`));
                                if (visibleResults.length === 0) return null;

                                const totalValue = visibleResults.reduce((sum, r) => sum + r.value, 0);

                                return (
                                  <div key={key} className="space-y-2 group">
                                    {/* Assignee/Team Header */}
                                    <div className="flex items-center justify-between text-sm">
                                      <div className="flex items-center gap-2">
                                        <span
                                          className="font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:text-emerald-500 hover:underline"
                                          onClick={() => {
                                            // Gather all ticket keys for this assignee/team across all age categories
                                            const allTicketKeys = visibleResults.flatMap(r => r.ticketKeys || []);
                                            handleDrillDown(allTicketKeys, `${isTeam ? 'Team' : 'Assignee'}: ${key} (All)`);
                                          }}
                                          title={`Click to see all tickets for this ${isTeam ? 'team' : 'assignee'}`}
                                        >
                                          {key}
                                        </span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">({totalValue} tickets)</span>
                                      </div>
                                      <button
                                        onClick={() => {
                                          // Hide all age categories for this assignee/team
                                          const dimsToAdd = [`${kpi.pluginId}|${key}-existing`, `${kpi.pluginId}|${key}-last_week`, `${kpi.pluginId}|${key}-this_week`];
                                          setHiddenDimensions((prev: Set<string>) => {
                                            const next = new Set(prev);
                                            dimsToAdd.forEach(d => next.add(d));
                                            return next;
                                          });
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-400 transition-opacity"
                                        title={`Hide this ${isTeam ? 'team' : 'assignee'}`}
                                      >
                                        <EyeOff className="h-3.5 w-3.5" />
                                      </button>
                                    </div>

                                    {/* Stacked/Segmented Bar */}
                                    <div className="space-y-1">
                                      <div className="relative h-6 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                        {visibleResults
                                          .sort((a, b) => {
                                            // Sort by age: existing → last_week → this_week
                                            const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
                                            const ageA = ageOrder[a.dimensions?.ageCategory as string] ?? 999;
                                            const ageB = ageOrder[b.dimensions?.ageCategory as string] ?? 999;
                                            return ageA - ageB;
                                          })
                                          .map((result, idx) => {
                                            const width = totalValue > 0 ? (result.value / totalValue) * 100 : 0;
                                            const ageCategory = result.dimensions?.ageCategory as string;
                                            const colorClass = ageColors[ageCategory] || 'bg-slate-400';

                                            return (
                                              <div
                                                key={idx}
                                                className={`${colorClass} hover:opacity-80 transition-opacity cursor-pointer`}
                                                style={{ width: `${width}%` }}
                                                onClick={() => handleDrillDown(result.ticketKeys || [], `${key} (${result.dimensions?.ageCategory})`)}
                                                title={`${result.dimensions?.ageCategory}: ${result.value} tickets`}
                                              />
                                            );
                                          })}
                                      </div>

                                      {/* Age Category Breakdown */}
                                      <div className="flex gap-2 flex-wrap">
                                        {visibleResults
                                          .sort((a, b) => {
                                            const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
                                            const ageA = ageOrder[a.dimensions?.ageCategory as string] ?? 999;
                                            const ageB = ageOrder[b.dimensions?.ageCategory as string] ?? 999;
                                            return ageA - ageB;
                                          })
                                          .map((result, idx) => {
                                            const ageCategory = result.dimensions?.ageCategory as string;
                                            const ageLabel: Record<string, string> = {
                                              'existing': '2+ weeks',
                                              'last_week': '1 week',
                                              'this_week': 'This week',
                                            };
                                            const colorClass = ageColors[ageCategory] || 'bg-slate-400';

                                            return (
                                              <div key={idx} className="flex items-center gap-1.5 text-xs">
                                                <div className={`w-2.5 h-2.5 rounded-sm ${colorClass}`} />
                                                <span className="text-slate-600 dark:text-slate-400">
                                                  {ageLabel[ageCategory] || ageCategory}: {result.value}
                                                </span>
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
                          {kpi.results.some((r: KpiCalcResult['results'][0]) => {
                            const dimensionKey = kpi.pluginId === 'open_tickets_by_issue_owner_team' ? 'team' : 'assignee';
                            return hiddenDimensions.has(`${kpi.pluginId}|${r.dimensions?.[dimensionKey] || r.name}`);
                          }) && (
                            <div className="text-xs text-slate-400 italic">
                              {Array.from(hiddenDimensions).filter(k => k.startsWith(kpi.pluginId + '|')).length} {kpi.pluginId === 'open_tickets_by_issue_owner_team' ? 'team(s)' : 'assignee(s)'} hidden
                            </div>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )) : null;

                default:
                  return null;
              }
            })}
          </div>
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
      <Sheet open={isDrillDownOpen} onOpenChange={(open) => !open && closeDrillDown()}>
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
        {showFloatingBar && !isDrillDownOpen && (
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
                  className="rounded-full h-8 px-4 bg-blue-600 hover:bg-blue-700 text-xs font-bold shadow-lg shadow-blue-600/20 gap-2"
                  onClick={() => {
                    hasUserInitiatedCalc.current = true;
                    runCalculation();
                    toast.info('Recalculating KPIs...');
                  }}
                  disabled={calculating}
                >
                  <RefreshCw className={`h-3 w-3 ${calculating ? 'animate-spin' : ''}`} />
                  Recalculate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-full h-8 px-2 text-[10px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 gap-1"
                  onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                  Top
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Recalculation Spinner */}
      {kpiCalculations.isCalculating && (
        <div className="fixed inset-0 z-[100] bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            <div className="text-center">
              <h3 className="text-lg font-bold">Calculating KPIs</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Processing your metrics...</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
