import { create } from 'zustand';
import { ChartConfig, ExtractedIssue, JiraConnection, KpiCalcResult } from '@/types/dashboard';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/config/local-store';

interface AppState {
  // App
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;

  // Data & Connections
  connections: JiraConnection[];
  setConnections: (conns: JiraConnection[]) => void;
  activeConnectionId: string;
  setActiveConnectionId: (id: string) => void;
  
  extractionResult: { total: number; etlRunId: string; issues: ExtractedIssue[]; isAllTickets?: boolean; } | null;
  setExtractionResult: (res: any) => void;
  
  masterDatasetInfo: { totalExtracted: number; dateRange?: { from: string; to: string }; lastUpdated: string; issues?: any[]; } | null;
  setMasterDatasetInfo: (info: any) => void;

  storageConfig: { provider: 'sqlite' | 'postgresql'; url: string; directUrl?: string; isCustom: boolean; connectionId?: string };
  setStorageConfig: (config: any) => void;

  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;

  // KPI Dashboard Date & Region
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  region: string;
  setRegion: (region: string) => void;

  // KPI Dashboard specific
  globalFilters: Record<string, string[]>;
  setGlobalFilters: (filters: Record<string, string[]>) => void;
  
  hiddenDimensions: Set<string>;
  setHiddenDimensions: (dims: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  
  dashboardCharts: ChartConfig[];
  setDashboardCharts: (charts: ChartConfig[]) => void;
  
  dashboardJqlQuery: string;
  setDashboardJqlQuery: (query: string) => void;
  
  filterPanelOpen: boolean;
  setFilterPanelOpen: (open: boolean) => void;
  
  showFloatingBar: boolean;
  setShowFloatingBar: (show: boolean) => void;

  kpiResults: KpiCalcResult[];
  setKpiResults: (results: KpiCalcResult[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'extract',
  setActiveTab: (tab) => set({ activeTab: tab }),
  
  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  connections: [],
  setConnections: (connections) => set({ connections }),
  
  activeConnectionId: '',
  setActiveConnectionId: (id) => set({ activeConnectionId: id }),

  extractionResult: null,
  setExtractionResult: (res) => set({ extractionResult: res }),

  masterDatasetInfo: null,
  setMasterDatasetInfo: (info) => set({ masterDatasetInfo: info }),

  storageConfig: { provider: 'sqlite', url: '', isCustom: false },
  setStorageConfig: (config) => set({ storageConfig: config }),

  settings: typeof structuredClone !== 'undefined' ? structuredClone(DEFAULT_SETTINGS) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  setSettings: (settings) => set({ settings: typeof structuredClone !== 'undefined' ? structuredClone(settings) : JSON.parse(JSON.stringify(settings)) }),

  dateFrom: '',
  setDateFrom: (date) => set({ dateFrom: date }),
  
  dateTo: '',
  setDateTo: (date) => set({ dateTo: date }),
  
  region: 'national',
  setRegion: (region) => set({ region }),

  globalFilters: {},
  setGlobalFilters: (filters) => set({ globalFilters: filters }),

  hiddenDimensions: new Set(),
  setHiddenDimensions: (dims) => set((state) => ({
    hiddenDimensions: new Set(typeof dims === 'function' ? dims(new Set(state.hiddenDimensions)) : dims)
  })),

  dashboardCharts: [{ id: 'chart-1', kpiId: '', type: 'bar', width: 'full' }],
  setDashboardCharts: (charts) => set({ dashboardCharts: charts }),

  dashboardJqlQuery: '',
  setDashboardJqlQuery: (query) => set({ dashboardJqlQuery: query }),

  filterPanelOpen: true,
  setFilterPanelOpen: (open) => set({ filterPanelOpen: open }),

  showFloatingBar: false,
  setShowFloatingBar: (show) => set({ showFloatingBar: show }),

  kpiResults: [],
  setKpiResults: (results) => set({ kpiResults: results }),
}));
