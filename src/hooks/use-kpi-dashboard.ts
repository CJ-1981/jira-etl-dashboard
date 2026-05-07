'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { localConfig, type SavedJql, type DashboardPreset, type AppSettings } from '@/lib/config/local-store';
import { ChartConfig, KpiCalcResult } from '@/types/dashboard';
import { useAppStore } from '@/store/app-store';
import { isTimeSeriesPlugin } from '@/lib/chart-data-utils';

export function useKpiDashboard() {
  const {
    activeConnectionId, settings, storageConfig, masterDatasetInfo,
    dateFrom, setDateFrom, dateTo, setDateTo, region, setRegion,
    globalFilters, setGlobalFilters, hiddenDimensions, setHiddenDimensions,
    dashboardCharts: charts, setDashboardCharts: setCharts,
    dashboardJqlQuery: jqlQuery, setDashboardJqlQuery: setJqlQuery,
    setKpiResults, kpiResults, setFilterPanelOpen
  } = useAppStore();

  const isFirstRender = useRef(true);
  const hasUserInitiatedCalc = useRef(false);
  const jqlInputRef = useRef<HTMLInputElement>(null);

  const formatDate = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // ─── Period Analysis Helpers ──────────────────────────────────────────────
  const periodAnalysis = useMemo(() => {
    // @MX:WARN: Date comparison must use local calendar strings to avoid UTC shifts
    // @MX:REASON: formatDate(new Date()) produces YYYY-MM-DD in local time, matching input type="date"
    const todayStr = formatDate(new Date());
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
  const [dashboardJqls, setDashboardJqls] = useState<SavedJql[]>(() => localConfig.getDashboardJqls());
  const [jqlToDelete, setJqlToDelete] = useState<string | null>(null);
  const [editingJqlId, setEditingJqlId] = useState<string | null>(null);

  // Staging filters for multi-select without instant update
  const [pendingFilters, setPendingFilters] = useState<Record<string, string[]>>(globalFilters);

  const [drillDownKeys, setDrillDownKeys] = useState<string[] | null>(null);
  const [drillDownTitle, setDrillDownTitle] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [presets, setPresets] = useState<DashboardPreset[]>([]);
  const [newPresetName, setNewPresetName] = useState('');
  const [presetPopoverOpen, setPresetPopoverOpen] = useState(false);

  // Load saved presets on mount
  useEffect(() => {
    if (activeConnectionId) {
      setPresets(localConfig.getDashboardPresets(activeConnectionId));
    }
  }, [activeConnectionId]);

  const handleSavePreset = () => {
    if (!newPresetName || !activeConnectionId) return;
    const newPreset: DashboardPreset = {
      id: `preset-${Date.now()}`,
      name: newPresetName,
      dateFrom,
      dateTo,
      globalFilters,
      charts,
      dashboardJql: jqlQuery,
      hiddenDimensions: Array.from(hiddenDimensions)
    };
    const updated = [...presets, newPreset];
    setPresets(updated);
    localConfig.saveDashboardPresets(activeConnectionId, updated);
    setNewPresetName('');
    setPresetPopoverOpen(false);
    toast.success(`View "${newPresetName}" saved`);
  };

  const handleUpdatePreset = (id: string, name: string) => {
    if (!activeConnectionId) return;
    const updated = presets.map(p => {
      if (p.id === id) {
        return {
          ...p,
          dateFrom,
          dateTo,
          globalFilters,
          charts,
          dashboardJql: jqlQuery,
          hiddenDimensions: Array.from(hiddenDimensions)
        };
      }
      return p;
    });
    setPresets(updated);
    localConfig.saveDashboardPresets(activeConnectionId, updated);
    toast.success(`View "${name}" updated`);
  };

  const handleLoadPreset = (preset: DashboardPreset) => {
    hasUserInitiatedCalc.current = true;
    setDateFrom(preset.dateFrom);
    setDateTo(preset.dateTo);
    setGlobalFilters(preset.globalFilters);
    setPendingFilters(preset.globalFilters);
    setCharts(preset.charts);
    setHiddenDimensions(new Set(preset.hiddenDimensions));
    setPresetPopoverOpen(false);
    toast.success(`Loaded view: ${preset.name}`);
  };

  const handleDeletePreset = (id: string) => {
    const updated = presets.filter(p => p.id !== id);
    setPresets(updated);
    if (activeConnectionId) {
      localConfig.saveDashboardPresets(activeConnectionId, updated);
    }
    toast.success('View deleted');
  };

  const handleUpdatePendingFilter = (key: string, value: string, newValue?: string | null) => {
    if (value === 'all') {
      setPendingFilters(prev => ({ ...prev, [key]: [] }));
      return;
    }
    setPendingFilters(prev => {
      const current = prev[key] || [];
      
      // If newValue is provided (even if null), we are replacing or removing
      if (newValue !== undefined) {
        const filtered = current.filter(v => v !== value);
        if (newValue === null) return { ...prev, [key]: filtered };
        return { ...prev, [key]: [...filtered, newValue] };
      }

      // Standard toggle behavior
      if (current.includes(value)) {
        return { ...prev, [key]: current.filter(v => v !== value) };
      } else {
        return { ...prev, [key]: [...current, value] };
      }
    });
  };

  const handleClearAll = useCallback(() => {
    setPendingFilters({});
    setJqlQuery('');
    toast.info('Filters cleared');
  }, [setJqlQuery]);

  const handleApplyFilters = () => {
    hasUserInitiatedCalc.current = true;
    setGlobalFilters(pendingFilters);
    toast.success('Filters applied');
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
    refetchInterval: (settings as AppSettings)?.webhooks?.enabled ? 30000 : false,
  });

  useEffect(() => {
    if (calculationData) {
      setKpiResults(calculationData);
    }
  }, [calculationData, setKpiResults]);

  // Derive filtered KPI results and dashboard charts based on active plugins
  const activePlugins = useMemo(() => {
    return JSON.parse(typeof window !== 'undefined' ? localStorage.getItem('cfg_active_plugins') || '[]' : '[]') as string[];
  }, []);

  // Note: Since activePlugins comes from localStorage, we might need a way to refresh it.
  // The original code used a storage event listener.
  const [activePluginsState, setActivePluginsState] = useState<string[]>(activePlugins);

  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'cfg_active_plugins') {
        setActivePluginsState(JSON.parse(e.newValue || '[]'));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const filteredKpiResults = useMemo(() => {
    if (activePluginsState.length === 0) return [];
    return kpiResults.filter(kpi => activePluginsState.includes(kpi.pluginId));
  }, [kpiResults, activePluginsState]);

  const filteredCharts = useMemo(() => {
    if (activePluginsState.length === 0) return [];
    return charts.filter(chart => !chart.kpiId || activePluginsState.includes(chart.kpiId));
  }, [charts, activePluginsState]);

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
    if (hasUserInitiatedCalc.current) {
      runCalculation();
    }
    if (isFirstRender.current) {
      isFirstRender.current = false;
    }
  }, [runCalculation]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        if (e.key === 'Escape') {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      // @MX:WARN: Global key handler handleKeyDown intercepts 'r' and '/'
      // @MX:REASON: Modifier check ensures 'r' only triggers recalculation when no modifiers are active, preventing blockage of browser refresh (Ctrl+R)
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) {
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
    const activeOrder = activePluginsState;
    if (activeOrder.length === 0) return filteredKpiResults;

    return [...filteredKpiResults].sort((a, b) => {
      const idxA = activeOrder.indexOf(a.pluginId);
      const idxB = activeOrder.indexOf(b.pluginId);
      if (idxA === -1 && idxB === -1) return 0;
      if (idxA === -1) return 1;
      if (idxB === -1) return -1;
      return idxA - idxB;
    });
  }, [filteredKpiResults, activePluginsState]);

  const mainKpis = sortedKpiResults.filter((r: KpiCalcResult) => !r.results[0]?.dimensions?.status && !r.results[0]?.dimensions?.priority && !r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  const assigneeKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.assignee && !isTimeSeriesPlugin(r.pluginId));
  const statusKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.status && r.pluginId === 'time_in_status' && !isTimeSeriesPlugin(r.pluginId));
  const slaStatusKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.status && (r.pluginId === 'sla_by_status' || r.pluginId === 'sla_by_status_excl_clone') && !isTimeSeriesPlugin(r.pluginId));
  const priorityKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.priority && !isTimeSeriesPlugin(r.pluginId));
  const distributionKpis = sortedKpiResults.filter((r: KpiCalcResult) => r.results[0]?.dimensions?.bucket && !isTimeSeriesPlugin(r.pluginId));
  const timeSeriesKpis = sortedKpiResults.filter((r: KpiCalcResult) => isTimeSeriesPlugin(r.pluginId));

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

  return {
    // State
    calculating, periodAnalysis, viewMode, setViewMode,
    presets, newPresetName, setNewPresetName, presetPopoverOpen, setPresetPopoverOpen,
    pendingFilters, drillDownKeys, setDrillDownKeys, drillDownTitle, setDrillDownTitle,
    dashboardJqls, setDashboardJqls, jqlToDelete, setJqlToDelete, editingJqlId, setEditingJqlId,
    jqlInputRef, filterOptions,
    // KPI Data
    mainKpis, assigneeKpis, statusKpis, slaStatusKpis, priorityKpis, distributionKpis, timeSeriesKpis, tableKpiResults,
    filteredCharts,
    // Actions
    runCalculation, handleSavePreset, handleUpdatePreset, handleLoadPreset, handleDeletePreset,
    handleUpdatePendingFilter, handleApplyFilters, handleClearAll, handleExportKpis, toggleDimension,
    handleAddChart, handleRemoveChart, handleUpdateChart, handleMoveChart, handleDrillDown
  };
}
