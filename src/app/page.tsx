'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, Settings, BarChart3, Zap, Plug, Calendar, Server, HardDrive, Sun, Moon, Loader2 
} from 'lucide-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { localConfig, type AppSettings } from '@/lib/config/local-store';
import { ConnectionsPanel } from '@/components/dashboard/ConnectionsPanel';
import { StoragePanel } from '@/components/dashboard/StoragePanel';
import { ExtractPanel } from '@/components/dashboard/ExtractPanel';
import { KpiDashboard } from '@/components/dashboard/KpiDashboard';
import { PluginsPanel } from '@/components/dashboard/PluginsPanel';
import { HolidaysPanel } from '@/components/dashboard/HolidaysPanel';
import { ExportPanel } from '@/components/dashboard/ExportPanel';
import { SettingsPanel } from '@/components/dashboard/SettingsPanel';
import { 
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue 
} from '@/components/ui/select';
import { JiraConnection } from '@/lib/config/local-store';
import { useAppStore } from '@/store/app-store';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  const {
    theme, setTheme,
    activeTab, setActiveTab,
    connections, setConnections,
    extractionResult, setExtractionResult,
    masterDatasetInfo, setMasterDatasetInfo,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    region, setRegion,
    activeConnectionId, setActiveConnectionId,
    settings, setSettings,
    kpiResults, setKpiResults,
    storageConfig, setStorageConfig,
    globalFilters, setGlobalFilters,
    hiddenDimensions, setHiddenDimensions,
    dashboardCharts, setDashboardCharts,
    dashboardJqlQuery, setDashboardJqlQuery,
    filterPanelOpen, setFilterPanelOpen,
    showFloatingBar, setShowFloatingBar,
    kpiSubTab, setKpiSubTab,
  } = useAppStore();

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('jira-etl-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme as 'light' | 'dark');
    }
  }, [setTheme]);

  const loadMasterDataset = useCallback(async (connectionId: string, config: any, signal?: AbortSignal) => {
    if (!connectionId) return;
    setIsLoadingDb(true);
    try {
      const res = await fetch(`/api/jira/master/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', storageConfig: config }),
        signal
      });
      const data = await res.json();
      if (data.success && data.data) {
        setMasterDatasetInfo({
          totalExtracted: data.data.totalExtracted,
          dateRange: data.data.dateRange,
          lastUpdated: data.data.lastUpdated,
          issues: data.data.issues
        });
        // Auto-populate extraction result to show ticket list
        setExtractionResult({
          total: data.data.totalExtracted,
          issues: data.data.issues,
          isAllTickets: true,
          etlRunId: 'master'
        } as any);
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return;
      console.error('Failed to auto-load master dataset:', e);
    } finally {
      setIsLoadingDb(false);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    
    // 1. Load config from local storage
    const conns = localConfig.getJiraConnections();
    setConnections(conns);

    const savedStorage = localConfig.getStorageConfig();
    if (savedStorage) setStorageConfig(savedStorage);

    const savedActive = localConfig.getActiveConnectionId();
    if (savedActive) {
      setActiveConnectionId(savedActive);
    }

    const savedSettings = localConfig.getSettings();
    if (savedSettings) setSettings(savedSettings);
    
    // Initially dates are empty strings from the store
  }, [mounted, setSettings, setConnections, setStorageConfig, setActiveConnectionId]);

  // Consolidate data loading into a single effect with AbortController
  useEffect(() => {
    if (!mounted || !activeConnectionId) return;
    
    const controller = new AbortController();
    
    // Persist active connection ID
    localConfig.setActiveConnectionId(activeConnectionId);
    
    // Auto-load data
    loadMasterDataset(activeConnectionId, storageConfig, controller.signal);
    
    return () => controller.abort();
  }, [activeConnectionId, storageConfig.provider, storageConfig.url, storageConfig.directUrl, mounted, loadMasterDataset]);

  // @MX:NOTE: Auto-populate default "Max" date range from master dataset if not already set
  useEffect(() => {
    if (!mounted || !masterDatasetInfo?.dateRange) return;
    
    // Only set if both are empty (meaning no saved state or user choice yet)
    if (!dateFrom && !dateTo) {
      setDateFrom(masterDatasetInfo.dateRange.from.split('T')[0]);
      setDateTo(masterDatasetInfo.dateRange.to.split('T')[0]);
    }
  }, [mounted, masterDatasetInfo, dateFrom, dateTo, setDateFrom, setDateTo]);

  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingBar(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem('jira-etl-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme, mounted]);

  // Persistence for Dashboard State (Filters, Charts, etc.)
  useEffect(() => {
    if (!mounted || !activeConnectionId) return;
    
    const savedState = localConfig.getDashboardState(activeConnectionId);
    if (savedState) {
      if (savedState.globalFilters) setGlobalFilters(savedState.globalFilters);
      if (savedState.hiddenDimensions) setHiddenDimensions(new Set(savedState.hiddenDimensions));
      if (savedState.charts) setDashboardCharts(savedState.charts);
      if (savedState.dashboardJql) setDashboardJqlQuery(savedState.dashboardJql);
      if (savedState.dateFrom) setDateFrom(savedState.dateFrom);
      if (savedState.dateTo) setDateTo(savedState.dateTo);
    } else {
      setGlobalFilters({});
      setHiddenDimensions(new Set());
      setDashboardCharts([{ id: 'chart-1', kpiId: '', type: 'bar', width: 'full', jqlFilter: { enabled: false, query: '', mode: 'refine' } }]);
      setDashboardJqlQuery('');
      // Don't set dates here, let the master data load effect handle "max" if missing
    }
  }, [activeConnectionId, mounted, setDateFrom, setDateTo, setGlobalFilters, setHiddenDimensions, setDashboardCharts, setDashboardJqlQuery]);

  useEffect(() => {
    if (!mounted || !activeConnectionId) return;
    
    const state = {
      globalFilters,
      hiddenDimensions: Array.from(hiddenDimensions),
      charts: dashboardCharts,
      dashboardJql: dashboardJqlQuery,
      dateFrom,
      dateTo
    };
    localConfig.saveDashboardState(activeConnectionId, state);
  }, [activeConnectionId, globalFilters, hiddenDimensions, dashboardCharts, dashboardJqlQuery, dateFrom, dateTo, mounted]);

  const handlePrint = () => {
    window.print();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === '1') setActiveTab('extract');
      if (e.key === '2') setActiveTab('kpi');
      if (e.key === '3') setActiveTab('settings');
      
      if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlePrint();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTab]);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
        <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 no-print">
          <div className="container max-w-7xl mx-auto grid grid-cols-2 lg:grid-cols-[1fr_auto_1fr] h-auto lg:h-16 items-center px-4 sm:px-6 lg:px-8 py-3 lg:py-0 gap-y-3 gap-x-2">
            
            {/* Left / Branding */}
            <div className="flex items-center gap-3 min-w-0 col-span-1 justify-start">
              <div className="bg-slate-900 p-1.5 rounded-lg shadow-lg shadow-yellow-500/20 shrink-0 flex items-center justify-center border border-yellow-500/20">
                <Zap className="h-5 w-5 text-yellow-400 fill-yellow-400" />
              </div>
              <div className="flex flex-col gap-[3px] min-w-0 overflow-hidden">
                <h1 className="text-sm font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 truncate leading-[1.1]">
                Jira ETL Dashboard
              </h1>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium truncate leading-[1.1]">
                Jira Extract and KPI Engine with German Holiday
              </p>
            </div>
          </div>
          
          {/* Middle / Tabs */}
          <div className="flex justify-center w-full col-span-2 lg:col-span-1 order-last lg:order-none no-print">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full sm:w-auto">
              <TabsList className="bg-transparent border-0 gap-1 h-9 w-full flex">
                <TabsTrigger value="extract" className="gap-2 flex-1 sm:flex-none sm:w-32 xl:w-48 h-8 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs min-w-0">
                  <Database className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline truncate">Data Center</span>
                  <span className="sm:hidden truncate">Data</span>
                </TabsTrigger>
                <TabsTrigger value="kpi" className="gap-2 flex-1 sm:flex-none sm:w-32 xl:w-48 h-8 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs min-w-0">
                  <BarChart3 className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline truncate">KPI Analytics</span>
                  <span className="sm:hidden truncate">KPI</span>
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2 flex-1 sm:flex-none sm:w-32 xl:w-48 h-8 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm text-xs min-w-0">
                  <Settings className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden sm:inline truncate">Settings</span>
                  <span className="sm:hidden truncate">Set</span>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Right / Controls */}
          <div className="flex items-center justify-end gap-2 sm:gap-3 min-w-0 col-span-1">
            {connections.length > 0 && (
              <Select value={activeConnectionId} onValueChange={setActiveConnectionId}>
                <SelectTrigger className="w-[100px] sm:w-[140px] md:w-[160px] bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 h-8 text-[11px] min-w-0">
                  <SelectValue placeholder="Connection" />
                </SelectTrigger>
                <SelectContent>
                  {connections.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-[11px]">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <button
              onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
            >
              {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </header>

      <main className="container py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">

          <TabsContent value="extract" className="space-y-6 overflow-hidden">
            <Tabs defaultValue="jira-etl" className="space-y-6">
              <div className="flex justify-center no-print">
                <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <TabsTrigger value="jira-etl" className="gap-2 px-6">
                    <Zap className="h-4 w-4 text-amber-500 fill-amber-500" />
                    Jira Extraction
                  </TabsTrigger>
                  <TabsTrigger value="db-export" className="gap-2 px-6">
                    <Database className="h-4 w-4" />
                    Data Export
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="jira-etl" className="mt-0">
                <ExtractPanel />
              </TabsContent>

              <TabsContent value="db-export" className="mt-0">
                <ExportPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="kpi" className="space-y-6 overflow-hidden">
            <Tabs value={kpiSubTab} onValueChange={setKpiSubTab} className="space-y-6">
              <div className="flex justify-center no-print">
                <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 h-10 p-1">
                  <TabsTrigger value="dashboard" className="gap-2 w-48 text-xs">
                    <BarChart3 className="h-4 w-4" />
                    Dashboard
                  </TabsTrigger>
                  <TabsTrigger value="plugins" className="gap-2 w-48 text-xs">
                    <Plug className="h-4 w-4" />
                    Plugins Configuration
                  </TabsTrigger>
                  <TabsTrigger value="holidays" className="gap-2 w-48 text-xs">
                    <Calendar className="h-4 w-4" />
                    Holidays Calendar
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="dashboard" className="mt-0">
                <KpiDashboard />
              </TabsContent>

              <TabsContent value="plugins" className="mt-0">
                <div data-plugins-section>
                  <PluginsPanel />
                </div>
              </TabsContent>

              <TabsContent value="holidays" className="mt-0">
                <HolidaysPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6 overflow-hidden">
            <Tabs defaultValue="connections" className="space-y-6">
              <div className="flex justify-center">
                <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                  <TabsTrigger value="connections" className="gap-2 px-6">
                    <Server className="h-4 w-4" />
                    Connections
                  </TabsTrigger>
                  <TabsTrigger value="storage" className="gap-2 px-6">
                    <HardDrive className="h-4 w-4" />
                    Storage
                  </TabsTrigger>
                  <TabsTrigger value="config" className="gap-2 px-6">
                    <Settings className="h-4 w-4" />
                    Configuration
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="connections" className="mt-0">
                <ConnectionsPanel />
              </TabsContent>

              <TabsContent value="storage" className="mt-0">
                <StoragePanel />
              </TabsContent>

              <TabsContent value="config" className="mt-0">
                <SettingsPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
        </main>
      </div>
      
      {isLoadingDb && (
        <div className="fixed inset-0 z-[100] bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 text-emerald-600 animate-spin" />
            <div className="text-center">
              <h3 className="text-lg font-bold">Loading Database</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Restoring your master dataset...</p>
            </div>
          </div>
        </div>
      )}

      {process.env.NODE_ENV === 'development' && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
