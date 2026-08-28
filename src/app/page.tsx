'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Database, Settings, BarChart3, Zap, Plug, Calendar, Server, HardDrive, Sun, Moon, Loader2, ChevronDown, ChevronRight
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { localConfig, KEYS, type AppSettings } from '@/lib/config/local-store';
import { dedupeChartsById } from '@/lib/chart-data-utils';
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
import { runtimeFeatures } from '@/lib/runtime/mode';
import { useAppStore } from '@/store/app-store';
import { usePollingNotifications } from '@/hooks/usePollingNotifications';
import { useGlobalShortcuts } from '@/hooks/useGlobalShortcuts';
import { useMasterDatasetQuery } from '@/hooks/useMasterDatasetQuery';

// @MX:NOTE: React Query Devtools are lazy-loaded and dev-only.
// @MX:REASON: A static import wired the devtools' internal lazy chunk into the page's
// chunk graph, so a stale dev cache or mid-session rebuild could throw a ChunkLoadError
// and break the page. Loading it dynamically with a catch that renders nothing keeps a
// failed devtools chunk from ever affecting the dashboard.
const ReactQueryDevtools = dynamic(
  () =>
    import('@tanstack/react-query-devtools')
      .then((mod) => mod.ReactQueryDevtools)
      .catch(() => () => null),
  { ssr: false, loading: () => null }
);

export default function Home() {
  const [mounted, setMounted] = useState(false);

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
    showDataCenterSubmenu, setShowDataCenterSubmenu,
    showKpiAnalyticsSubmenu, setShowKpiAnalyticsSubmenu,
    showSettingsSubmenu, setShowSettingsSubmenu,
  } = useAppStore();

  // Surface a toast whenever a scheduled background pull finishes, on any tab.
  usePollingNotifications();

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem(KEYS.theme);
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme as 'light' | 'dark');
    }
  }, [setTheme]);

  // Shared React Query source for the master dataset. Its cache entry is also
  // refreshed (invalidateQueries/fetchQuery) by useExtraction after extractions
  // and background polling runs, so the page and the extract panel share one
  // request stream per connection/storage-config pair.
  const {
    data: masterData,
    isLoading: isLoadingDb,
  } = useMasterDatasetQuery(activeConnectionId, storageConfig, { enabled: mounted && !!activeConnectionId });

  // Set when a load should also auto-populate the ticket list (initial restore
  // and manual connection switches) — post-extraction refreshes must NOT
  // overwrite the fresh extraction preview, so they never set this flag.
  const autoPopulateTicketsRef = useRef(false);

  // Single sync point from the query into the store. The store remains the
  // source of truth for all consumers (KPI dashboard, cards, headers, export).
  // React Query's structural sharing keeps `masterData` referentially stable
  // when a refetch returns an identical payload, so this effect only writes on
  // genuinely new data.
  useEffect(() => {
    if (!masterData) return;
    setMasterDatasetInfo({
      totalExtracted: masterData.totalExtracted,
      dateRange: masterData.dateRange,
      lastUpdated: masterData.lastUpdated,
      issues: masterData.issues
    });
    if (autoPopulateTicketsRef.current) {
      autoPopulateTicketsRef.current = false;
      // Auto-populate extraction result to show ticket list
      setExtractionResult({
        total: masterData.totalExtracted,
        issues: masterData.issues ?? [],
        isAllTickets: true,
        etlRunId: 'master'
      });
    }
  }, [masterData, setMasterDatasetInfo, setExtractionResult]);

  const initialMountRef = useRef(false);

  useEffect(() => {
    if (!mounted) return;

    // 1. Load config from local storage
    const conns = localConfig.getJiraConnections();
    setConnections(conns);

    const savedStorage = localConfig.getStorageConfig();
    if (savedStorage) setStorageConfig(savedStorage);

    const savedActive = localConfig.getActiveConnectionId();
    const savedSettings = localConfig.getSettings();
    if (savedSettings) setSettings(savedSettings);

    // Load submenu visibility states
    setShowDataCenterSubmenu(localConfig.getShowDataCenterSubmenu());
    setShowKpiAnalyticsSubmenu(localConfig.getShowKpiAnalyticsSubmenu());
    setShowSettingsSubmenu(localConfig.getShowSettingsSubmenu());

    // Restore the dataset for the saved connection via the shared query —
    // setting the active id is enough to enable it, and the restored ticket
    // list should auto-populate.
    //
    // @MX:NOTE: Mount-only initialization. The load is driven by the
    // master-dataset query reacting to activeConnectionId/storageConfig; we
    // only seed those from the fresh values read directly from localConfig.
    if (savedActive) {
      initialMountRef.current = true;
      autoPopulateTicketsRef.current = true;
      setActiveConnectionId(savedActive);
    }

    // Initially dates are empty strings from the store
  }, [mounted, setSettings, setConnections, setStorageConfig, setActiveConnectionId, setShowDataCenterSubmenu, setShowKpiAnalyticsSubmenu, setShowSettingsSubmenu]);

  // Secondary effect: Handle connection changes after initial load
  // This only runs when user manually switches connections via UI
  useEffect(() => {
    // Skip if we haven't loaded initial config yet
    // (activeConnectionId will be empty string initially)
    if (!activeConnectionId || !mounted) return;

    // Skip if this is the initial load path (handled by effect above)
    if (initialMountRef.current) {
      initialMountRef.current = false;
      return;
    }

    // Skip if this looks like the initial load (storageConfig not set yet)
    if (!storageConfig.provider) return;

    // Persist active connection ID
    localConfig.setActiveConnectionId(activeConnectionId);

    // A manual switch restores the ticket list for the new connection once its
    // master-dataset query resolves.
    autoPopulateTicketsRef.current = true;
  }, [activeConnectionId, storageConfig.provider, storageConfig.url, storageConfig.directUrl, mounted]);

  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingBar(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(KEYS.theme, theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme, mounted]);

  // Persistence for Dashboard State (Filters, Charts, etc.)
  // Combined with auto-populate to ensure proper execution order
  useEffect(() => {
    if (!mounted || !activeConnectionId) return;

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) console.log('[App] Loading saved dashboard state for connection');

    const savedState = localConfig.getDashboardState(activeConnectionId);

    if (savedState) {
      if (isDev) console.log('[App] Found saved dashboard state');
      if (savedState.globalFilters) setGlobalFilters(savedState.globalFilters);
      // Persisted shape is already a string array; coerce defensively in case
      // of legacy/corrupt entries.
      if (savedState.hiddenDimensions) setHiddenDimensions(Array.isArray(savedState.hiddenDimensions) ? savedState.hiddenDimensions : []);
      if (savedState.charts) setDashboardCharts(dedupeChartsById(savedState.charts));
      if (savedState.dashboardJql) setDashboardJqlQuery(savedState.dashboardJql);
    } else {
      if (isDev) console.log('[App] No saved dashboard state, using defaults');
      setGlobalFilters({});
      setHiddenDimensions([]);
      setDashboardCharts([{ id: 'chart-1', kpiId: '', type: 'bar', width: 'full', height: 'md', jqlFilter: { enabled: false, query: '', mode: 'override' } }]);
      setDashboardJqlQuery('');
    }

    // Always default to MAX range from master dataset if available
    // This ensures MAX is always the default, regardless of saved state
    // Saved dates will only be preserved if explicitly different from MAX
    if (masterDatasetInfo?.dateRange?.from && masterDatasetInfo?.dateRange?.to) {
      const maxFromStr = masterDatasetInfo.dateRange.from.split('T')[0];
      const maxToStr = masterDatasetInfo.dateRange.to.split('T')[0];

      if (isDev) console.log('[App] Master dataset date range available');

      // Check if saved dates are different from MAX (user explicitly changed them)
      const savedDatesDifferFromMax = savedState?.dateFrom && savedState?.dateTo &&
        (savedState.dateFrom !== maxFromStr || savedState.dateTo !== maxToStr);

      if (savedDatesDifferFromMax) {
        if (isDev) console.log('[App] Using saved dates (user preference)');
        setDateFrom(savedState.dateFrom!);
        setDateTo(savedState.dateTo!);
      } else {
        if (isDev) console.log('[App] Defaulting to MAX range');
        setDateFrom(maxFromStr);
        setDateTo(maxToStr);
      }
    } else {
      if (isDev) console.log('[App] Master dataset date range not available yet');
    }
   
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConnectionId, mounted, masterDatasetInfo]);

  useEffect(() => {
    if (!mounted || !activeConnectionId) return;

    const state = {
      globalFilters,
      hiddenDimensions,
      charts: dashboardCharts,
      dashboardJql: dashboardJqlQuery,
      dateFrom,
      dateTo
    };
    localConfig.saveDashboardState(activeConnectionId, state);
  }, [activeConnectionId, globalFilters, hiddenDimensions, dashboardCharts, dashboardJqlQuery, dateFrom, dateTo, mounted]);

  // Persist submenu visibility states
  useEffect(() => {
    if (!mounted) return;
    localConfig.setShowDataCenterSubmenu(showDataCenterSubmenu);
  }, [showDataCenterSubmenu, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localConfig.setShowKpiAnalyticsSubmenu(showKpiAnalyticsSubmenu);
  }, [showKpiAnalyticsSubmenu, mounted]);

  useEffect(() => {
    if (!mounted) return;
    localConfig.setShowSettingsSubmenu(showSettingsSubmenu);
  }, [showSettingsSubmenu, mounted]);

  const handlePrint = () => {
    window.print();
  };

  useGlobalShortcuts({
    modifierBindings: [
      // Ctrl/Cmd+P — print (works regardless of focus, except while typing)
      { key: 'p', modifierKeys: ['ctrl', 'meta'], onTrigger: () => handlePrint() },
    ],
    bareBindings: [
      { key: '1', onTrigger: () => setActiveTab('extract') },
      { key: '2', onTrigger: () => setActiveTab('kpi') },
      { key: '3', onTrigger: () => setActiveTab('settings') },
    ],
  });

  return (
    <>
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
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
          <div className="flex justify-center items-center w-full col-span-2 lg:col-span-1 order-last lg:order-none no-print gap-2">
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

            {/* Submenu Toggle Button - Context-aware based on active tab */}
            {activeTab === 'extract' && (
              <button
                onClick={() => setShowDataCenterSubmenu(!showDataCenterSubmenu)}
                className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 font-medium shrink-0"
                title={showDataCenterSubmenu ? "Hide submenu" : "Show submenu"}
              >
                {showDataCenterSubmenu ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Sub-Menu</span>
              </button>
            )}

            {activeTab === 'kpi' && (
              <button
                onClick={() => setShowKpiAnalyticsSubmenu(!showKpiAnalyticsSubmenu)}
                className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 font-medium shrink-0"
                title={showKpiAnalyticsSubmenu ? "Hide submenu" : "Show submenu"}
              >
                {showKpiAnalyticsSubmenu ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Sub-Menu</span>
              </button>
            )}

            {activeTab === 'settings' && (
              <button
                onClick={() => setShowSettingsSubmenu(!showSettingsSubmenu)}
                className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors px-2 py-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 font-medium shrink-0"
                title={showSettingsSubmenu ? "Hide submenu" : "Show submenu"}
              >
                {showSettingsSubmenu ? (
                  <ChevronDown className="h-3.5 w-3.5" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5" />
                )}
                <span className="hidden sm:inline">Sub-Menu</span>
              </button>
            )}
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

      <main className="container py-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex-1 w-full">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">

          <TabsContent value="extract" className="space-y-6">
            <Tabs defaultValue="jira-etl" className="space-y-6">
              {showDataCenterSubmenu && (
                <div className="flex justify-center no-print sticky top-[4.5rem] z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                  <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 max-w-full overflow-x-auto custom-scrollbar">
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
              )}

              <TabsContent value="jira-etl" className="mt-0">
                <ExtractPanel />
              </TabsContent>

              <TabsContent value="db-export" className="mt-0">
                <ExportPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="kpi" className="space-y-6">
            {/* @MX:NOTE: Enable smooth scroll to top on sub-tab switch for better UX */}
            {/* @MX:REASON: Ensures users are returned to the top of the viewport when navigating between analytics views */}
            <Tabs value={kpiSubTab} onValueChange={(value) => {
              setKpiSubTab(value);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }} className="space-y-6">
              {showKpiAnalyticsSubmenu && (
                <div className="flex justify-center no-print sticky top-[4.5rem] z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                  <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 h-10 p-1 max-w-full overflow-x-auto custom-scrollbar">
                    <TabsTrigger value="dashboard" className="gap-2 w-40 sm:w-48 text-xs">
                      <BarChart3 className="h-4 w-4" />
                      Dashboard
                    </TabsTrigger>
                    <TabsTrigger value="plugins" className="gap-2 w-40 sm:w-48 text-xs">
                      <Plug className="h-4 w-4" />
                      Plugins Configuration
                    </TabsTrigger>
                    <TabsTrigger value="holidays" className="gap-2 w-40 sm:w-48 text-xs">
                      <Calendar className="h-4 w-4" />
                      Holidays Calendar
                    </TabsTrigger>
                  </TabsList>
                </div>
              )}

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

          <TabsContent value="settings" className="space-y-6">
            <Tabs defaultValue="connections" className="space-y-6">
              {showSettingsSubmenu && (
                <div className="flex justify-center sticky top-[4.5rem] z-50 bg-white/80 dark:bg-slate-950/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 py-2 -mx-4 px-4 sm:mx-0 sm:px-0">
                  <TabsList className="bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 max-w-full overflow-x-auto custom-scrollbar">
                    <TabsTrigger value="connections" className="gap-2 px-6">
                      <Server className="h-4 w-4" />
                      Connections
                    </TabsTrigger>
                    {runtimeFeatures.hasStoragePanel && (
                      <TabsTrigger value="storage" className="gap-2 px-6">
                        <HardDrive className="h-4 w-4" />
                        Storage
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="config" className="gap-2 px-6">
                      <Settings className="h-4 w-4" />
                      Configuration
                    </TabsTrigger>
                  </TabsList>
                </div>
              )}

              <TabsContent value="connections" className="mt-0">
                <ConnectionsPanel />
              </TabsContent>

              {runtimeFeatures.hasStoragePanel && (
                <TabsContent value="storage" className="mt-0">
                  <StoragePanel />
                </TabsContent>
              )}

              <TabsContent value="config" className="mt-0">
                <SettingsPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
        </main>

        <footer className="mt-auto border-t border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-950/60 no-print">
          <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-center justify-center gap-1.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">
            <span>v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
            <span aria-hidden="true">·</span>
            <span>Built {process.env.NEXT_PUBLIC_BUILD_DATE}</span>
          </div>
        </footer>
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
    </>
  );
}
