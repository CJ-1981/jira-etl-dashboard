import { create } from 'zustand';
import { ChartConfig, ExtractedIssue, JiraConnection, KpiCalcResult, JqlFilter, KpiCardConfig, DashboardView } from '@/types/dashboard';
import { AppSettings, DEFAULT_SETTINGS } from '@/lib/config/local-store';

// @MX:ANCHOR: Central Application Store (useAppStore)
// @MX:NOTE: Manages global state including connections, extraction results, settings, and dashboard configuration.

interface AppState {
  // App
  activeTab: string;
  setActiveTab: (tab: string) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;

  // Submenu visibility state
  showDataCenterSubmenu: boolean;
  setShowDataCenterSubmenu: (show: boolean) => void;
  showKpiAnalyticsSubmenu: boolean;
  setShowKpiAnalyticsSubmenu: (show: boolean) => void;
  showSettingsSubmenu: boolean;
  setShowSettingsSubmenu: (show: boolean) => void;

  // Data & Connections
  connections: JiraConnection[];
  setConnections: (conns: JiraConnection[]) => void;
  activeConnectionId: string;
  setActiveConnectionId: (id: string) => void;
  
  extractionResult: { total: number; etlRunId?: string; issues: ExtractedIssue[]; isAllTickets?: boolean; } | null;
  setExtractionResult: (res: { total: number; etlRunId?: string; issues: ExtractedIssue[]; isAllTickets?: boolean; } | null) => void;
  
  masterDatasetInfo: { totalExtracted: number; dateRange?: { from: string; to: string }; lastUpdated: string; issues?: any[]; } | null;
  setMasterDatasetInfo: (info: { totalExtracted: number; dateRange?: { from: string; to: string }; lastUpdated: string; issues?: any[]; } | null) => void;

  storageConfig: { provider: 'sqlite' | 'postgresql'; url: string; directUrl?: string; isCustom: boolean; connectionId?: string };
  setStorageConfig: (config: { provider: 'sqlite' | 'postgresql'; url: string; directUrl?: string; isCustom: boolean; connectionId?: string }) => void;

  settings: AppSettings;
  setSettings: (settings: AppSettings) => void;

  // KPI Dashboard Date & Region
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  region: string;
  setRegion: (region: string) => void;
  // @MX:NOTE: Tracks which period preset (7D, 30D, 1Y, MAX) is currently selected
  selectedPeriodPreset: string | undefined;
  setSelectedPeriodPreset: (preset: string | undefined) => void;

  // KPI Dashboard specific
  globalFilters: Record<string, string[]>;
  setGlobalFilters: (filters: Record<string, string[]>) => void;
  
  hiddenDimensions: Set<string>;
  setHiddenDimensions: (dims: Set<string> | ((prev: Set<string>) => Set<string>)) => void;
  
  dashboardCharts: ChartConfig[];
  setDashboardCharts: (charts: ChartConfig[]) => void;
  toggleWidgetExpanded: (widgetId: string) => void;
  
  dashboardJqlQuery: string;
  setDashboardJqlQuery: (query: string) => void;
  
  filterPanelOpen: boolean;
  setFilterPanelOpen: (open: boolean) => void;
  
  showFloatingBar: boolean;
  setShowFloatingBar: (show: boolean) => void;

  kpiResults: KpiCalcResult[];
  setKpiResults: (results: KpiCalcResult[]) => void;

  kpiSubTab: string;
  setKpiSubTab: (tab: string) => void;

  // Custom JQL filters per widget
  customWidgetResults: Map<string, { context: any; results: KpiCalcResult[] }>;
  setCustomWidgetResults: (results: Map<string, { context: any; results: KpiCalcResult[] }>) => void;

  calculatingWidgets: Set<string>;
  setCalculatingWidgets: (widgets: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

  kpiCardConfigs: KpiCardConfig[];
  setKpiCardConfigs: (configs: KpiCardConfig[]) => void;

  jqlResultCache: Map<string, { results: KpiCalcResult[]; timestamp: number }>;
  setJqlResultCache: (cache: Map<string, { results: KpiCalcResult[]; timestamp: number }>) => void;

  // @MX:ANCHOR: Saved Views State
  // @MX:NOTE: Persistent dashboard layouts and configurations stored in the database.
  savedViews: DashboardView[];
  setSavedViews: (views: DashboardView[]) => void;
  activeView: DashboardView | null;
  setActiveView: (view: DashboardView | null) => void;
  isViewModified: boolean;
  setIsViewModified: (modified: boolean) => void;

  // @MX:ANCHOR: Widget Titles
  // @MX:NOTE: User-defined titles for widgets and charts.
  widgetTitles: Record<string, string>;
  setWidgetTitles: (titles: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;

  // @MX:ANCHOR: Dashboard Section Collapse State
  // @MX:NOTE: Persists the collapsed/expanded state of entire sections like "Metrics Overview".
  collapsedWidgets: Set<string>;
  setCollapsedWidgets: (widgets: Set<string> | ((prev: Set<string>) => Set<string>)) => void;

  // @MX:ANCHOR: Widget Heights
  widgetHeights: Record<string, number>;
  setWidgetHeights: (heights: Record<string, number> | ((prev: Record<string, number>) => Record<string, number>)) => void;

  // @MX:ANCHOR: Widget Display Order
  // @MX:NOTE: Controls the order of widgets (individual KPIs and panel sections) on the dashboard.
  widgetDisplayOrder: string[];
  setWidgetDisplayOrder: (order: string[]) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeTab: 'extract',
  setActiveTab: (tab) => set({ activeTab: tab }),

  theme: 'dark',
  setTheme: (theme) => set({ theme }),

  // Submenu visibility defaults
  showDataCenterSubmenu: true,
  setShowDataCenterSubmenu: (show) => set({ showDataCenterSubmenu: show }),
  showKpiAnalyticsSubmenu: true,
  setShowKpiAnalyticsSubmenu: (show) => set({ showKpiAnalyticsSubmenu: show }),
  showSettingsSubmenu: true,
  setShowSettingsSubmenu: (show) => set({ showSettingsSubmenu: show }),

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

  // @MX:NOTE: Dashboard defaults and settings initialization
  settings: typeof structuredClone !== 'undefined' ? structuredClone(DEFAULT_SETTINGS) : JSON.parse(JSON.stringify(DEFAULT_SETTINGS)),
  // @MX:WARN: Deep clone settings
  // @MX:REASON: Cloning ensures that nested object mutations don't bypass Zustand's change detection, which relies on reference equality.
  setSettings: (settings) => set({ settings: typeof structuredClone !== 'undefined' ? structuredClone(settings) : JSON.parse(JSON.stringify(settings)) }),

  dateFrom: '',
  setDateFrom: (date) => set({ dateFrom: date }),

  dateTo: '',
  setDateTo: (date) => set({ dateTo: date }),

  region: 'national',
  setRegion: (region) => set({ region }),

  selectedPeriodPreset: undefined,
  setSelectedPeriodPreset: (preset) => set({ selectedPeriodPreset: preset }),

  globalFilters: {},
  setGlobalFilters: (filters) => set({ globalFilters: filters }),

  hiddenDimensions: new Set(),
  // @MX:WARN: Set cloning
  // @MX:REASON: Sets are mutable; we must create a new Set instance so Zustand detects the state change.
  setHiddenDimensions: (dims) => set((state) => ({
    hiddenDimensions: new Set(typeof dims === 'function' ? dims(new Set(state.hiddenDimensions)) : dims)
  })),

  // @MX:NOTE: Initial dashboard charts configuration
  dashboardCharts: [{ id: 'chart-1', kpiId: '', type: 'bar', width: 'full', height: 'md', jqlFilter: { enabled: false, query: '', mode: 'override' }, expanded: true }],
  setDashboardCharts: (charts) => set({ dashboardCharts: charts }),
  toggleWidgetExpanded: (widgetId) => set((state) => ({
    dashboardCharts: state.dashboardCharts.map(chart =>
      chart.id === widgetId ? { ...chart, expanded: chart.expanded === false ? true : false } : chart
    )
  })),

  dashboardJqlQuery: '',
  setDashboardJqlQuery: (query) => set({ dashboardJqlQuery: query }),

  filterPanelOpen: true,
  setFilterPanelOpen: (open) => set({ filterPanelOpen: open }),

  showFloatingBar: false,
  setShowFloatingBar: (show) => set({ showFloatingBar: show }),

  kpiResults: [],
  setKpiResults: (results) => set({ kpiResults: results }),

  kpiSubTab: 'dashboard',
  setKpiSubTab: (tab) => set({ kpiSubTab: tab }),

  customWidgetResults: new Map(),
  setCustomWidgetResults: (results) => set({ customWidgetResults: results }),

  calculatingWidgets: new Set(),
  setCalculatingWidgets: (widgets) => set((state) => ({
    calculatingWidgets: typeof widgets === 'function' ? widgets(state.calculatingWidgets) : widgets
  })),

  kpiCardConfigs: [],
  setKpiCardConfigs: (configs) => set({ kpiCardConfigs: configs }),

  jqlResultCache: new Map(),
  setJqlResultCache: (cache) => set({ jqlResultCache: cache }),

  // @MX:ANCHOR: Saved Views
  savedViews: [],
  setSavedViews: (savedViews) => set({ savedViews }),
  activeView: null,
  setActiveView: (activeView) => set({ activeView }),
  isViewModified: false,
  setIsViewModified: (isViewModified) => set({ isViewModified }),

  // @MX:ANCHOR: Widget Titles
  widgetTitles: {},
  // @MX:WARN: Record update pattern
  // @MX:REASON: Updates are merged to preserve other widget titles.
  setWidgetTitles: (titles) => set((state) => ({
    widgetTitles: typeof titles === 'function' ? titles(state.widgetTitles) : titles
  })),

  collapsedWidgets: new Set(),
  setCollapsedWidgets: (widgets) => set((state) => ({
    collapsedWidgets: new Set(typeof widgets === 'function' ? widgets(new Set(state.collapsedWidgets)) : widgets)
  })),

  widgetHeights: {},
  setWidgetHeights: (heights) => set((state) => ({
    widgetHeights: typeof heights === 'function' ? heights(state.widgetHeights) : heights
  })),

  // @MX:ANCHOR: Widget Display Order
  widgetDisplayOrder: [],
  setWidgetDisplayOrder: (order) => set({ widgetDisplayOrder: order }),
}));
