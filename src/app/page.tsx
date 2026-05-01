'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Database, Settings, BarChart3, Zap, Plug, Calendar, Server, HardDrive, Sun, Moon 
} from 'lucide-react';
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
import { ChartConfig, ExtractedIssue, JiraConnection } from '@/types/dashboard';

export default function Home() {
  // Static server-safe defaults to prevent hydration mismatch
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem('jira-etl-theme');
    if (savedTheme === 'light' || savedTheme === 'dark') {
      setTheme(savedTheme as 'light' | 'dark');
    }
  }, []);



  const [activeTab, setActiveTab] = useState('extract');
  const [connections, setConnections] = useState<JiraConnection[]>([]);
  const [extractionResult, setExtractionResult] = useState<{
    total: number; etlRunId: string; issues: ExtractedIssue[];
  } | null>(null);
  const [masterDatasetInfo, setMasterDatasetInfo] = useState<{
    totalExtracted: number; dateRange?: { from: string; to: string }; lastUpdated: string; issues?: any[];
  } | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [region, setRegion] = useState('national');
  const [activeConnectionId, setActiveConnectionId] = useState<string>('');
  const [settings, setSettings] = useState<AppSettings | any>(localConfig.getSettings());
  const [kpiResults, setKpiResults] = useState<any>([]);
  const [storageConfig, setStorageConfig] = useState<{ provider: 'sqlite' | 'postgresql', url: string, directUrl?: string, isCustom: boolean }>({ provider: 'sqlite', url: '', isCustom: false });

  // Lifted KPI Dashboard State
  const [globalFilters, setGlobalFilters] = useState<Record<string, string[]>>({});
  const [hiddenDimensions, setHiddenDimensions] = useState<Set<string>>(new Set());
  const [dashboardCharts, setDashboardCharts] = useState<ChartConfig[]>([
    { id: 'chart-1', kpiId: '', type: 'bar', width: 'full' }
  ]);
  const [dashboardJqlQuery, setDashboardJqlQuery] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState(true);
  const [showFloatingBar, setShowFloatingBar] = useState(false);

  const loadMasterDataset = useCallback(async (connectionId: string, config: any) => {
    if (!connectionId) return;
    try {
      const res = await fetch(`/api/jira/master/${connectionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get', storageConfig: config })
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
    } catch (e) {
      console.error('Failed to auto-load master dataset:', e);
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
      // Trigger initial load if we have an active connection and config
      loadMasterDataset(savedActive, savedStorage || storageConfig);
    }
    
    // Set default dates
    const now = new Date();
    const lastMonth = new Date(now);
    lastMonth.setMonth(now.getMonth() - 1);
    setDateFrom(lastMonth.toISOString().split('T')[0]);
    setDateTo(now.toISOString().split('T')[0]);
  }, [mounted, loadMasterDataset]);

  useEffect(() => {
    const handleScroll = () => {
      setShowFloatingBar(window.scrollY > 400);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    if (!mounted || !activeConnectionId) return;
    localConfig.setActiveConnectionId(activeConnectionId);
    // Auto-load data when connection changes
    loadMasterDataset(activeConnectionId, storageConfig);
  }, [activeConnectionId, mounted, loadMasterDataset]);

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
    } else {
      setGlobalFilters({});
      setHiddenDimensions(new Set());
      setDashboardCharts([{ id: 'chart-1', kpiId: '', type: 'bar', width: 'full' }]);
      setDashboardJqlQuery('');
    }
  }, [activeConnectionId, mounted]);

  useEffect(() => {
    if (!mounted || !activeConnectionId) return;
    
    const state = {
      globalFilters,
      hiddenDimensions: Array.from(hiddenDimensions),
      charts: dashboardCharts,
      dashboardJql: dashboardJqlQuery
    };
    localConfig.saveDashboardState(activeConnectionId, state);
  }, [activeConnectionId, globalFilters, hiddenDimensions, dashboardCharts, dashboardJqlQuery, mounted]);

  const handlePrint = () => {
    window.print();
  };

  const handleSettingsUpdate = (newSettings: any) => {
    setSettings(newSettings);
    localConfig.saveSettings(newSettings);
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur supports-[backdrop-filter]:bg-white/60 no-print">
        <div className="container relative flex h-16 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3 pl-10 z-10">
            <div className="bg-emerald-600 p-1.5 rounded-lg shadow-lg shadow-emerald-500/20 shrink-0">
              <Database className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col items-start">
              <h1 className="text-base font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400 leading-tight">
                Jira ETL Dashboard
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
                Extract and KPI Engine
              </p>
            </div>
          </div>
          
          <div className="absolute left-1/2 -translate-x-1/2 no-print z-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-auto">
              <TabsList className="bg-transparent border-0 gap-1 h-9">
                <TabsTrigger value="extract" className="gap-2 w-36 h-8 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
                  <Database className="h-3.5 w-3.5" />
                  Data Center
                </TabsTrigger>
                <TabsTrigger value="kpi" className="gap-2 w-36 h-8 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
                  <BarChart3 className="h-3.5 w-3.5" />
                  KPI Analytics
                </TabsTrigger>
                <TabsTrigger value="settings" className="gap-2 w-36 h-8 rounded-md data-[state=active]:bg-emerald-600 data-[state=active]:text-white data-[state=active]:shadow-sm">
                  <Settings className="h-3.5 w-3.5" />
                  Settings
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="flex items-center justify-end gap-3 pr-4 z-10">
            {connections.length > 0 && (
              <Select value={activeConnectionId} onValueChange={setActiveConnectionId}>
                <SelectTrigger className="w-[160px] bg-slate-100 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700 h-8 text-[11px]">
                  <SelectValue placeholder="Select Connection" />
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
              className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
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
                    <Database className="h-4 w-4" />
                    Jira Extraction
                  </TabsTrigger>
                  <TabsTrigger value="db-export" className="gap-2 px-6">
                    <Zap className="h-4 w-4" />
                    Data Export
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="jira-etl" className="mt-0">
                <ExtractPanel
                  connections={connections}
                  extractionResult={extractionResult}
                  setExtractionResult={setExtractionResult}
                  masterDatasetInfo={masterDatasetInfo}
                  setMasterDatasetInfo={setMasterDatasetInfo}
                  dateFrom={dateFrom}
                  setDateFrom={setDateFrom}
                  dateTo={dateTo}
                  setDateTo={setDateTo}
                  activeConnectionId={activeConnectionId}
                  settings={settings}
                  setSettings={setSettings}
                  setKpiResults={setKpiResults}
                  storageConfig={storageConfig}
                />
              </TabsContent>

              <TabsContent value="db-export" className="mt-0">
                <ExportPanel
                  extractionResult={extractionResult}
                  masterDatasetInfo={masterDatasetInfo}
                  dateFrom={dateFrom}
                  setDateFrom={setDateFrom}
                  dateTo={dateTo}
                  setDateTo={setDateTo}
                  region={region}
                  setRegion={setRegion}
                  storageConfig={storageConfig}
                />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="kpi" className="space-y-6 overflow-hidden">
            <Tabs defaultValue="dashboard" className="space-y-6">
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
                <KpiDashboard
                  connections={connections}
                  extractionResult={extractionResult}
                  masterDatasetInfo={masterDatasetInfo}
                  setMasterDatasetInfo={setMasterDatasetInfo}
                  dateFrom={dateFrom}
                  setDateFrom={setDateFrom}
                  dateTo={dateTo}
                  setDateTo={setDateTo}
                  region={region}
                  setRegion={setRegion}
                  activeConnectionId={activeConnectionId}
                  settings={settings}
                  kpiResults={kpiResults}
                  setKpiResults={setKpiResults}
                  storageConfig={storageConfig}
                  globalFilters={globalFilters}
                  setGlobalFilters={setGlobalFilters}
                  hiddenDimensions={hiddenDimensions}
                  setHiddenDimensions={setHiddenDimensions}
                  charts={dashboardCharts}
                  setCharts={setDashboardCharts}
                  jqlQuery={dashboardJqlQuery}
                  setJqlQuery={setDashboardJqlQuery}
                  filterPanelOpen={filterPanelOpen}
                  setFilterPanelOpen={setFilterPanelOpen}
                  theme={theme}
                  showFloatingBar={showFloatingBar}
                  onPrint={handlePrint}
                />
              </TabsContent>

              <TabsContent value="plugins" className="mt-0">
                <PluginsPanel settings={settings} setSettings={setSettings} onSettingsUpdate={handleSettingsUpdate} />
              </TabsContent>

              <TabsContent value="holidays" className="mt-0">
                <HolidaysPanel region={region} setRegion={setRegion} />
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
                <ConnectionsPanel
                  connections={connections}
                  setConnections={setConnections}
                  activeConnectionId={activeConnectionId}
                  setActiveConnectionId={setActiveConnectionId}
                  storageConfig={storageConfig}
                  setStorageConfig={setStorageConfig}
                />
              </TabsContent>

              <TabsContent value="storage" className="mt-0">
                <StoragePanel 
                  storageConfig={storageConfig} 
                  setStorageConfig={setStorageConfig}
                  settings={settings}
                  setSettings={setSettings}
                />
              </TabsContent>

              <TabsContent value="config" className="mt-0">
                <SettingsPanel onSettingsUpdate={handleSettingsUpdate} storageConfig={storageConfig} />
              </TabsContent>
            </Tabs>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
