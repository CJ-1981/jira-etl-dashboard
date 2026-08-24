'use client';

import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { isTimeSeriesPlugin } from '@/lib/chart-data-utils';
import { getIssueOwnerTeamField } from '@/lib/jira/field-config';
import { extractSelectFieldValue } from '@/lib/jira/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import {
  BarChart3, AlertTriangle,
  Loader2, RefreshCw,
  X,
} from 'lucide-react';
import { localConfig, KEYS, type KpiPlugin } from '@/lib/config/local-store';
import { ChartConfig, KpiCalcResult } from '@/types/dashboard';
import { useAppStore } from '@/store/app-store';
import { useDrillDown } from '@/hooks/useDrillDown';
import { usePeriodAnalysis } from '@/hooks/usePeriodAnalysis';
import { usePluginVisibility } from '@/hooks/usePluginVisibility';
import { useJqlFilters } from '@/hooks/useJqlFilters';
import { useKpiCalculations } from '@/hooks/useKpiCalculations';
import { useWidgetOrder } from '@/hooks/useWidgetOrder';
import { DrillDownSheet } from './DrillDownSheet';
import { TicketListWidget } from './TicketListWidget';
import {
  StatusTimeWidget,
  StatusOpenWidget,
  SlaPriorityWidget,
  OtherPriorityWidget,
  SlaStatusWidget,
  AssigneeWidget,
  KanbanWidget,
  CycleTimeHistogramWidget,
  DashboardHeader,
  DashboardFloatingBar,
  MetricsOverview,
  VisualizationsSection,
} from './widgets';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { filterIssuesForWidget } from '@/lib/jql-widget-eval';

// @MX:NOTE: Normalizes data for saved view change detection
// @MX:REASON - Normalize data before comparison to prevent false positives from Set/Array ordering
const normalizeViewData = (data: any) => {
  return JSON.stringify(data, (key, value) => {
    if (value instanceof Set) {
      return Array.from(value).sort();
    }
    if (Array.isArray(value)) {
      // Sort arrays of strings/numbers for consistency (copy first to avoid mutation)
      if (value.length > 0 && (typeof value[0] === 'string' || typeof value[0] === 'number')) {
        return [...value].sort();
      }
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sortedKeys = Object.keys(value).sort();
      const sortedObj: any = {};
      sortedKeys.forEach(k => {
        sortedObj[k] = value[k];
      });
      return sortedObj;
    }
    return value;
  });
};

export function KpiDashboard() {
  const {
    connections, extractionResult, masterDatasetInfo, setMasterDatasetInfo,
    dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion,
    selectedPeriodPreset, setSelectedPeriodPreset,
    activeConnectionId, settings, kpiResults, storageConfig,
    globalFilters, setGlobalFilters, hiddenDimensions, setHiddenDimensions,
    dashboardCharts: charts, setDashboardCharts: setCharts,
    dashboardJqlQuery: jqlQuery, setDashboardJqlQuery: setJqlQuery,
    filterPanelOpen, setFilterPanelOpen, theme, showFloatingBar,
    setActiveTab, kpiSubTab, setKpiSubTab,
    customWidgetResults, setCustomWidgetResults, calculatingWidgets, setCalculatingWidgets,
    kpiCardConfigs, setKpiCardConfigs,
    activeView, setIsViewModified, setActiveView,
    widgetTitles, setWidgetTitles,
    collapsedWidgets, setCollapsedWidgets,
    widgetHeights, setWidgetHeights
  } = useAppStore();

  const onPrint = () => window.print();
  const isFirstRender = useRef(true);
  const hasUserInitiatedCalc = useRef(false);

  const issueMap = useMemo(() => {
    const map = new Map<string, any>();
    for (const issue of masterDatasetInfo?.issues || []) {
      map.set(issue.key, issue);
    }
    return map;
  }, [masterDatasetInfo?.issues]);

  // Toggle section collapse state in the global store
  const toggleWidgetCollapse = useCallback((pluginId: string) => {
    setCollapsedWidgets(prev => {
      const next = new Set(prev);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      return next;
    });
    setIsViewModified(true);
  }, [setCollapsedWidgets, setIsViewModified]);

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
  const pluginVisibility = usePluginVisibility(allPluginIds, KEYS.activePlugins);
  const { widgetOrder, toggleWidgetVisibility } = useWidgetOrder();

  // Automatically sync widget order with available plugins
  useEffect(() => {
    const availablePlugins = kpiResults
      .filter(kpi => !isTimeSeriesPlugin(kpi.pluginId)) // Exclude time-series plugins
      .map(kpi => `plugin-${kpi.pluginId}`);

    // Add any missing plugins to widget order
    availablePlugins.forEach(pluginId => {
      if (!widgetOrder.includes(pluginId)) {
        toggleWidgetVisibility(pluginId);
      }
    });
  }, [kpiResults, widgetOrder, toggleWidgetVisibility]);

  // Fetch plugin metadata for correct names
  useEffect(() => {
    const fetchPlugins = async () => {
      try {
        const customPlugins = localConfig.getKpiPlugins();
        let allPlugins = [...customPlugins];
        try {
          const res = await fetch('/api/kpi/plugins');
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  const { isError: isCalcError, error: calcError } = kpiCalculations;

  // Dismissal state for the calculation error banner.
  // @MX:NOTE: Automatically re-arms when the error identity changes (or clears),
  // so a new failure surfaces even after a previous dismissal.
  const [calcErrorDismissed, setCalcErrorDismissed] = useState(false);
  useEffect(() => {
    setCalcErrorDismissed(false);
  }, [calcError]);

  // Table-only view — grid view removed

  const jqlInputRef = useRef<HTMLInputElement | null>(null);

  // Removed: setDashboardJqls and activePluginsOrder loading - now handled by useJqlFilters and usePluginVisibility hooks

  const lastSaveRequestId = useRef(0);

  // @MX:NOTE: Detect which period preset is currently active based on dateFrom/dateTo
  const getActivePeriodPreset = (): string | undefined => {
    if (!dateFrom || !dateTo) return undefined;

    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const todayStr = today.toISOString().split('T')[0];

    // Check MAX preset
    const masterStart = masterDatasetInfo?.dateRange?.from ? new Date(masterDatasetInfo.dateRange.from) : null;
    const masterEnd = masterDatasetInfo?.dateRange?.to ? new Date(masterDatasetInfo.dateRange.to) : null;
    const masterStartStr = masterStart ? new Date(masterStart).toISOString().split('T')[0] : null;
    const maxEndStr = masterEnd ? new Date(masterEnd).toISOString().split('T')[0] : todayStr;

    if (masterStartStr && dateFrom === masterStartStr && dateTo === maxEndStr) {
      return 'MAX';
    }

    // Check other presets (only if not MAX and dateTo is today)
    if (dateTo === todayStr) {
      const presets = [
        { label: '7D', days: 7 },
        { label: '14D', days: 14 },
        { label: '30D', days: 30 },
        { label: '60D', days: 60 },
        { label: '90D', days: 90 },
        { label: '180D', days: 180 },
        { label: '1Y', days: 365 },
      ];

      for (const preset of presets) {
        const targetStart = new Date(today);
        targetStart.setDate(today.getDate() - preset.days);
        targetStart.setHours(0, 0, 0, 0);
        const startStr = targetStart.toISOString().split('T')[0];
        if (dateFrom === startStr) {
          return preset.label;
        }
      }
    }

    return undefined; // Custom date range
  };

  useEffect(() => {
    if (!activeView) {
      setIsViewModified(false);
      return;
    }

    const selectedPeriodPreset = getActivePeriodPreset();
    const currentData = {
      dateFrom,
      dateTo,
      selectedPeriodPreset,
      region,
      globalFilters,
      charts,
      dashboardJqlQuery: jqlQuery,
      kpiCardConfigs,
      hiddenDimensions: Array.from(hiddenDimensions),
      widgetTitles,
      collapsedWidgets: Array.from(collapsedWidgets),
      widgetHeights,
    };

    try {
      const savedData = JSON.parse(activeView.data);

      // @MX:NOTE: When a period preset is active, compare presets instead of exact dates
      // This prevents false positives when the day changes but the preset (e.g., "1Y") is still the same
      const currentPreset = currentData.selectedPeriodPreset;
      const savedPreset = savedData.selectedPeriodPreset;

      let isModified: boolean;
      if (currentPreset && savedPreset && currentPreset === savedPreset) {
        // Same preset active - compare everything except dates (dates are derived from preset)
        const { dateFrom: _1, dateTo: _2, selectedPeriodPreset: _3, ...currentWithoutDates } = currentData;
        const { dateFrom: _4, dateTo: _5, selectedPeriodPreset: _6, ...savedWithoutDates } = savedData;
        isModified = normalizeViewData(currentWithoutDates) !== normalizeViewData(savedWithoutDates);
      } else {
        // Different or custom date ranges - compare everything including dates
        isModified = normalizeViewData(currentData) !== normalizeViewData(savedData);
      }

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
    collapsedWidgets,
    widgetHeights,
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

  // Restore every hidden dimension whose key starts with the given prefix
  // (used by the widgets' "Restore All" buttons).
  const restoreDimensions = useCallback((prefix: string) => {
    setHiddenDimensions((prev: Set<string>) => {
      const next = new Set(prev);
      next.forEach(k => { if (k.startsWith(prefix)) next.delete(k); });
      return next;
    });
  }, [setHiddenDimensions]);

  // Hide several dimension keys at once (used by the stacked-bar widgets to
  // hide all age categories of a row together).
  const hideDimensions = useCallback((keys: string[]) => {
    setHiddenDimensions((prev: Set<string>) => {
      const next = new Set(prev);
      keys.forEach(d => next.add(d));
      return next;
    });
  }, [setHiddenDimensions]);

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

  // Use central hook's triggerCalculation for Recalculate button
  // @MX:NOTE: Removed duplicate local useQuery (was unused by UI and didn't update Zustand)
  const calculating = kpiCalculations.isCalculating;
  const runCalculation = kpiCalculations.triggerCalculation;

  // @MX:NOTE: Safe wrapper for fire-and-forget recalculation triggers.
  // @MX:REASON: The upgraded useKpiCalculations throws on calculation failures, so
  // bare invocations could produce unhandled promise rejections. This catches any
  // rejection, logs it, and surfaces it via toast. The hook's isError/error state
  // drives the error banner, so last good results stay visible underneath.
  const runCalculationSafe = useCallback(() => {
    hasUserInitiatedCalc.current = true;
    runCalculation().catch((err) => {
      console.error('[KpiDashboard] KPI calculation failed:', err);
      toast.error(err instanceof Error ? err.message : 'KPI calculation failed');
    });
  }, [runCalculation]);

  // Shared "Recalculate" button handler (header, floating bar, error banner).
  const handleRecalculate = useCallback(() => {
    runCalculationSafe();
    toast.info('Recalculating KPIs...');
  }, [runCalculationSafe]);

  // Quick-preset selection from the header; marks the change user-initiated so
  // the auto-recalc logic treats it as an explicit action.
  const handleSelectPreset = useCallback((label: string, fromStr: string, toStr: string) => {
    hasUserInitiatedCalc.current = true;
    setDateFrom(fromStr);
    setDateTo(toStr);
    setSelectedPeriodPreset(label);
  }, [setDateFrom, setDateTo, setSelectedPeriodPreset]);

  // @MX:NOTE: Calculate KPI results for a specific widget with custom JQL
  // @MX:REASON: Independent widget calculations allow side-by-side data comparison
  const calculateWidgetJql = useCallback(async (widgetId: string, jqlFilter: any) => {
    if (!activeConnectionId || !masterDatasetInfo?.issues) return;

    // Track loading state
    setCalculatingWidgets(prev => { const s = new Set(prev); s.add(widgetId); return s; });

    try {
      // @MX:NOTE: Client-side JQL filtering — engine extracted to lib/jql-widget-eval.
      // @MX:REASON: API doesn't support customJql, so we filter issues client-side.
      // Global dashboard filters apply first (refine mode), then the widget JQL on
      // top; override mode skips global filters and starts from the full dataset.
      const filteredIssues = filterIssuesForWidget(
        masterDatasetInfo.issues,
        jqlFilter,
        globalFilters
      );

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

  // ─── Derived plugin filtering ────────────────────────────────────────────────
  // @MX:ANCHOR: Derived (never stored) plugin filtering
  // @MX:NOTE: The store's kpiResults slice holds the RAW calculation results
  // (owned by the React Query sync in useKpiCalculations). Visibility by
  // active plugins is DERIVED here at render time instead of being written
  // back into the store — the previous self-referencing filter effect caused
  // a store feedback loop and could destroy raw data on refetch boundaries.
  const hasConfiguredActivePlugins = typeof window !== 'undefined'
    ? localStorage.getItem(KEYS.activePlugins) !== null
    : false;

  const filteredKpiResults = useMemo(() => {
    // Never configured → show everything in original order.
    if (!hasConfiguredActivePlugins) return kpiResults;
    // Explicitly none selected → hide everything.
    if (pluginVisibility.activePlugins.length === 0) return [];
    return kpiResults.filter(r => pluginVisibility.activePlugins.includes(r.pluginId));
  }, [kpiResults, pluginVisibility.activePlugins, hasConfiguredActivePlugins]);

  // Chart configs are filtered for display only.
  // @MX:NOTE: When all plugins are hidden we deliberately keep chart configs intact.
  // @MX:REASON: "No plugins selected" is a visibility state, not a user deletion of charts.
  // The chart section is not rendered while no results are visible, so configs
  // are simply restored once plugins are re-enabled.
  const visibleCharts = useMemo(() => {
    if (!hasConfiguredActivePlugins) return charts;
    if (pluginVisibility.activePlugins.length === 0) return charts;
    return charts.filter(chart => !chart.kpiId || pluginVisibility.activePlugins.includes(chart.kpiId));
  }, [charts, pluginVisibility.activePlugins, hasConfiguredActivePlugins]);

  const handleExportKpis = () => {
    const rows: string[][] = [['Metric', 'Value', 'Unit', 'Category']];
    // Export the derived (visible) results — same data the user sees in the table.
    filteredKpiResults.forEach(kpi => {
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

  // @MX:NOTE: Uses ref to avoid feedback loop — triggerCalculation recreates when deps change,
  // so including it in the dependency array would cause infinite re-calculation
  const runCalculationRef = useRef(runCalculation);
  useEffect(() => {
    runCalculationRef.current = runCalculation;
  });

  useEffect(() => {
    // On first render, just mark as rendered - don't auto-calculate
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, []);

  // Keyboard Shortcuts
  useGlobalShortcuts({
    blurInputOnEscape: true,
    bareBindings: [
      {
        key: 'r',
        caseInsensitive: true,
        onTrigger: ({ event }) => {
          event.preventDefault();
          runCalculationSafe();
          toast.info('Recalculating KPIs...');
        },
      },
      {
        key: '/',
        onTrigger: ({ event }) => {
          event.preventDefault();
          setFilterPanelOpen(true);
          setTimeout(() => {
            jqlInputRef.current?.focus();
          }, 100);
        },
      },
    ],
  });

  const sortedKpiResults = useMemo(() => {
    if (filteredKpiResults.length === 0) return [];

    // Never configured → original order, no sorting.
    if (!hasConfiguredActivePlugins) return filteredKpiResults;

    // Sort the derived filtered results by the configured active-plugin order.
    const activeOrder = pluginVisibility.activePlugins;
    return [...filteredKpiResults].sort((a, b) => {
      const idxA = activeOrder.indexOf(a.pluginId);
      const idxB = activeOrder.indexOf(b.pluginId);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [filteredKpiResults, pluginVisibility.activePlugins, hasConfiguredActivePlugins]);

  const mainKpis = useMemo(() =>
    sortedKpiResults.filter((r: KpiCalcResult) =>
      !r.results[0]?.dimensions?.status &&
      !r.results[0]?.dimensions?.priority &&
      !r.results[0]?.dimensions?.assignee &&
      !r.results[0]?.dimensions?.team &&
      !r.results[0]?.dimensions?.bucket &&
      !isTimeSeriesPlugin(r.pluginId)
    ),
    [sortedKpiResults]
  );
  // @MX:NOTE: Widget Order Mapping - Maps widget display order IDs to their corresponding KPI groups
  // @MX:REASON: Groups plugins by dimension type for organized dashboard rendering
  const widgetOrderMapping = useMemo(() => {
    const mapping: Record<string, { kpis: KpiCalcResult[]; component: string }> = {};

    // Group by dimension type, not by artificial panels
    sortedKpiResults.forEach((kpiResult) => {
      const { pluginId, results } = kpiResult;
      if (!results[0]) return;

      // Do not include time-series plugins in widgets
      if (isTimeSeriesPlugin(pluginId)) return;

      const dimension = results[0].dimensions;
      if (!dimension) return;

      // Determine component type based on dimension
      let componentType: string;
      if (dimension.kanban) {
        componentType = 'kanban';
      } else if (dimension.status) {
        if (pluginId === 'time_in_status') {
          componentType = 'status-time';
        } else if (pluginId === 'sla_by_status' || pluginId === 'sla_by_status_excl_clone') {
          componentType = 'sla-status';
        } else {
          componentType = 'status-open';
        }
      } else if (dimension.priority && pluginId === 'sla_by_priority') {
        componentType = 'sla-priority';
      } else if (dimension.priority) {
        componentType = 'other-priority'; // open_tickets_by_priority
      } else if (dimension.assignee || dimension.team) {
        componentType = 'assignee'; // Team dimension uses same rendering as assignee
      } else if (dimension.bucket) {
        componentType = 'cycle-time-histogram'; // cycle_time_histogram and aging_wip both use ChartCard histogram renderer
      } else if (dimension.activity) {
        componentType = 'ticket-list'; // weekly_ticket_list plugin
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


  const filterOptions = useMemo(() => {
    const issueOwnerTeamField = getIssueOwnerTeamField();
    const customFields = localConfig.getCustomExtractFields();
    
    const options: Record<string, Set<string>> = { 
      project: new Set<string>(), 
      assignee: new Set<string>(), 
      priority: new Set<string>(), 
      issueType: new Set<string>(), 
      status: new Set<string>(), 
      component: new Set<string>(), 
      label: new Set<string>(), 
      issueOwnerTeam: new Set<string>() 
    };

    // Pre-initialize sets for custom fields to ensure they exist even if empty
    customFields.forEach(cf => {
      if (!options[cf.fieldId]) {
        options[cf.fieldId] = new Set<string>();
      }
    });

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
          }
        }

        // Dynamically collect unique values from user-defined custom fields
        customFields.forEach(cf => {
          // Skip if it's the Issue Owner Team field as it's already handled above
          if (cf.fieldId === issueOwnerTeamField) return;
          
          const val = extractSelectFieldValue(f[cf.fieldId]);
          if (val) {
            options[cf.fieldId].add(val);
          }
        });
      });
    }

    // Convert sets to sorted arrays
    const result: Record<string, string[]> = {};
    Object.entries(options).forEach(([key, set]) => {
      result[key] = Array.from(set).sort();
    });
    
    return result;
  }, [masterDatasetInfo]);

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <DashboardHeader
        masterDatasetInfo={masterDatasetInfo}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={(value) => {
          setDateFrom(value);
          setSelectedPeriodPreset(undefined);
        }}
        onDateToChange={(value) => {
          setDateTo(value);
          setSelectedPeriodPreset(undefined);
        }}
        periodAnalysis={periodAnalysis}
        onSelectPreset={handleSelectPreset}
        calculating={calculating}
        onRecalculate={handleRecalculate}
        onPrint={onPrint}
        globalFilters={globalFilters}
        filterPanelOpen={filterPanelOpen}
        onToggleFilterPanel={() => setFilterPanelOpen(!filterPanelOpen)}
        filterPanel={{
          jqlFilters,
          filterOptions,
          globalFilters,
          setGlobalFilters,
          jqlQuery,
          setJqlQuery,
          jqlInputRef,
          editingJqlId,
          setEditingJqlId,
          jqlToDelete,
          setJqlToDelete,
          setIsViewModified,
          handleApplyFilters,
        }}
      />

      {/* Calculation Error Banner — non-blocking; last good results stay visible below */}
      {isCalcError && !calcErrorDismissed && (
        <div
          role="alert"
          className="flex items-start justify-between gap-3 rounded-lg border border-red-500/20 bg-red-50/80 dark:bg-red-500/10 backdrop-blur-sm px-4 py-3 animate-in fade-in duration-300"
        >
          <div className="flex items-start gap-2.5 min-w-0">
            <AlertTriangle className="h-4 w-4 text-red-500 dark:text-red-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-red-700 dark:text-red-300">
                KPI calculation failed
              </p>
              <p className="text-xs text-red-600/90 dark:text-red-400/90 break-words">
                {calcError?.message || 'An unexpected error occurred while calculating KPIs.'}
              </p>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                Showing last successful results.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-[10px] font-bold text-red-600 dark:text-red-400 hover:text-red-700 hover:bg-red-500/10 gap-1"
              onClick={() => {
                runCalculationSafe();
                toast.info('Recalculating KPIs...');
              }}
              disabled={calculating}
            >
              <RefreshCw className={`h-3 w-3 ${calculating ? 'animate-spin' : ''}`} />
              Retry
            </Button>
            <Button
              size="sm"
              variant="ghost"
              aria-label="Dismiss error"
              className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              onClick={() => setCalcErrorDismissed(true)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {filteredKpiResults.length > 0 && (<>
        <MetricsOverview
          isExpanded={!collapsedWidgets.has('metrics-overview')}
          onToggleCollapse={() => toggleWidgetCollapse('metrics-overview')}
          results={sortedKpiResults}
          totalRows={sortedKpiResults.reduce((acc, r) => acc + r.results.length, 0)}
          onExport={handleExportKpis}
          onDrillDown={handleDrillDown}
          getPluginName={getPluginName}
        />

        {/* Ordered Widgets Section - follows widget display order */}
        {orderedWidgets.length > 0 && (
          <div className="space-y-4">
            {orderedWidgets.map((widget) => {
              switch (widget.component) {
                case 'status-time':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi) => (
                    <StatusTimeWidget
                      key={`status-time-${kpi.pluginId}`}
                      kpi={kpi}
                      isExpanded={!collapsedWidgets.has(kpi.pluginId)}
                      onToggleCollapse={toggleWidgetCollapse}
                      hiddenDimensions={hiddenDimensions}
                      onRestoreAll={restoreDimensions}
                      onToggleDimension={toggleDimension}
                      onDrillDown={handleDrillDown}
                      pluginDescription={pluginRegistry[kpi.pluginId]?.description}
                    />
                  )) : null;

                case 'status-open':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi) => (
                    <StatusOpenWidget
                      key={`status-open-${kpi.pluginId}`}
                      kpi={kpi}
                      isExpanded={!collapsedWidgets.has(kpi.pluginId)}
                      onToggleCollapse={toggleWidgetCollapse}
                      hiddenDimensions={hiddenDimensions}
                      onRestoreAll={restoreDimensions}
                      onHideDimensions={hideDimensions}
                      onDrillDown={handleDrillDown}
                      pluginDescription={pluginRegistry[kpi.pluginId]?.description}
                    />
                  )) : null;

                case 'sla-priority':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <SlaPriorityWidget
                      key={`sla-priority-${kpi.pluginId}-${kpiIdx}`}
                      kpi={kpi}
                      isExpanded={!collapsedWidgets.has(kpi.pluginId)}
                      onToggleCollapse={toggleWidgetCollapse}
                      hiddenDimensions={hiddenDimensions}
                      onRestoreAll={restoreDimensions}
                      onToggleDimension={toggleDimension}
                      onDrillDown={handleDrillDown}
                      pluginDescription={pluginRegistry[kpi.pluginId]?.description}
                    />
                  )) : null;

                case 'other-priority':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <OtherPriorityWidget
                      key={`other-priority-${kpi.pluginId}-${kpiIdx}`}
                      kpi={kpi}
                      title={getPluginName(kpi.pluginId)}
                      isExpanded={!collapsedWidgets.has(kpi.pluginId)}
                      onToggleCollapse={toggleWidgetCollapse}
                      hiddenDimensions={hiddenDimensions}
                      onRestoreAll={restoreDimensions}
                      onHideDimensions={hideDimensions}
                      onDrillDown={handleDrillDown}
                      pluginDescription={pluginRegistry[kpi.pluginId]?.description}
                    />
                  )) : null;

                case 'sla-status':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <SlaStatusWidget
                      key={`sla-status-${kpi.pluginId}-${kpiIdx}`}
                      kpi={kpi}
                      isExpanded={!collapsedWidgets.has(kpi.pluginId)}
                      onToggleCollapse={toggleWidgetCollapse}
                      hiddenDimensions={hiddenDimensions}
                      onRestoreAll={restoreDimensions}
                      onToggleDimension={toggleDimension}
                      onDrillDown={handleDrillDown}
                      pluginDescription={pluginRegistry[kpi.pluginId]?.description}
                    />
                  )) : null;

                case 'assignee':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <AssigneeWidget
                      key={`assignee-${kpi.pluginId}-${kpiIdx}`}
                      kpi={kpi}
                      title={getPluginName(kpi.pluginId)}
                      isExpanded={!collapsedWidgets.has(kpi.pluginId)}
                      onToggleCollapse={toggleWidgetCollapse}
                      hiddenDimensions={hiddenDimensions}
                      onRestoreAll={restoreDimensions}
                      onHideDimensions={hideDimensions}
                      onDrillDown={handleDrillDown}
                      pluginDescription={pluginRegistry[kpi.pluginId]?.description}
                    />
                  )) : null;

                case 'kanban':
                  return widget.kpis.length > 0 ? widget.kpis.map((kpi, kpiIdx) => (
                    <KanbanWidget
                      key={`kanban-${kpi.pluginId}-${kpiIdx}`}
                      kpi={kpi}
                      title={getPluginName(kpi.pluginId)}
                      isExpanded={!collapsedWidgets.has(kpi.pluginId)}
                      onToggleCollapse={toggleWidgetCollapse}
                      onDrillDown={handleDrillDown}
                    />
                  )) : null;

                case 'cycle-time-histogram':
                  return widget.kpis.length > 0 ? (
                    <CycleTimeHistogramWidget
                      key={`cycle-time-histogram-wrapper-${widget.kpis[0].pluginId}`}
                      kpis={widget.kpis}
                      kpiResults={filteredKpiResults}
                      hiddenDimensions={hiddenDimensions}
                      toggleDimension={toggleDimension}
                      onRemove={handleRemoveChart}
                      onChange={handleUpdateChart}
                      onMoveUp={handleMoveChart ? (id) => handleMoveChart(id, 'up') : undefined}
                      onMoveDown={handleMoveChart ? (id) => handleMoveChart(id, 'down') : undefined}
                      onDrillDown={handleDrillDown}
                      theme={theme}
                      calculateWidgetJql={calculateWidgetJql}
                    />
                  ) : null;

                case 'ticket-list': {
                    const tlPluginId = widget.kpis[0]?.pluginId;
                    const tlCollapsed = collapsedWidgets.has(tlPluginId);
                    const tlConn = connections.find((c) => c.id === activeConnectionId);
                    const tlJiraBase = tlConn ? (tlConn.baseUrl?.startsWith('http') ? tlConn.baseUrl : `https://${tlConn.baseUrl}`) : '';
                    return widget.kpis.length > 0 ? (
                      <div key={`ticket-list-${tlPluginId}`} className="col-span-1 md:col-span-2 lg:col-span-3">
                        <TicketListWidget
                          pluginId={tlPluginId}
                          isCollapsed={tlCollapsed}
                          onToggleCollapse={toggleWidgetCollapse}
                          kpis={widget.kpis}
                          issueMap={issueMap}
                          jiraBaseUrl={tlJiraBase}
                        />
                      </div>
                    ) : null;
                  }
              }

            })}
          </div>
        )}


        {/* Chart Section */}
        <VisualizationsSection
          charts={visibleCharts}
          kpiResults={filteredKpiResults}
          hiddenDimensions={hiddenDimensions}
          toggleDimension={toggleDimension}
          onRemove={handleRemoveChart}
          onChange={handleUpdateChart}
          onMoveUp={handleMoveChart ? (id) => handleMoveChart(id, 'up') : undefined}
          onMoveDown={handleMoveChart ? (id) => handleMoveChart(id, 'down') : undefined}
          onDrillDown={handleDrillDown}
          theme={theme}
          calculateWidgetJql={calculateWidgetJql}
          onAddChart={handleAddChart}
        />

      </>)}
      {filteredKpiResults.length === 0 && !calculating && (
        <Card className="border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50"><CardContent className="py-16 text-center text-slate-400 dark:text-slate-500"><BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" /><p className="text-lg font-medium">No KPI results yet</p></CardContent></Card>
      )}

      {/* Drill-down Sheet */}
      <DrillDownSheet
        isOpen={isDrillDownOpen}
        onOpenChange={(open) => !open && closeDrillDown()}
        drillDownTitle={drillDownTitle}
        drillDownKeys={drillDownKeys}
        issues={masterDatasetInfo?.issues || []}
        connections={connections}
        activeConnectionId={activeConnectionId}
      />

      <DashboardFloatingBar
        visible={showFloatingBar && !isDrillDownOpen}
        dateFrom={dateFrom}
        dateTo={dateTo}
        globalFilters={globalFilters}
        pluginIds={sortedKpiResults.map(p => p.pluginId)}
        calculating={calculating}
        onScrollToPeriod={() => {
          document.querySelector('[data-period-section]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }}
        onOpenFilters={() => {
          setFilterPanelOpen(true);
          setTimeout(() => {
            document.querySelector('[data-filter-section]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }}
        onGoToPlugins={() => {
          setActiveTab('kpi');
          setKpiSubTab('plugins');
          setTimeout(() => {
            document.querySelector('[data-plugins-section]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 100);
        }}
        onRecalculate={handleRecalculate}
      />

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
