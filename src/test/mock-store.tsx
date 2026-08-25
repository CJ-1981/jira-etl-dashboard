import React from 'react';
import { vi } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AppSettings } from '@/lib/config/local-store';

/**
 * Shared component-test helpers.
 *
 * Usage in a test file:
 *
 *   const store = vi.hoisted(() => createMockStore());
 *   vi.mock('@/store/app-store', () => ({
 *     useAppStore: (sel: any) => (typeof sel === 'function' ? sel(store) : store),
 *   }));
 *   // then override fields: store.activeConnectionId = 'c1';
 *
 * Setters are vi.fns that mutate the store in place, so subsequent selector
 * reads see the updated value (mirrors how the real store updates state).
 */

// Inlined (not imported) so a per-test vi.mock of local-store can't blank it.
const DEFAULT_SETTINGS: AppSettings = {
  rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
  general: {
    defaultHolidayState: 'national',
    workStartHour: 9,
    workEndHour: 17,
    defaultSlaTargetHours: 40,
    listMaxHeight: 400,
  },
  persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
  sla: { statusTargets: {}, useAnyoneCommentsForSla: false },
  alerts: { thresholds: {} },
  webhooks: { enabled: false, url: '', secret: '' },
} as unknown as AppSettings;

const deepClone = <T,>(v: T): T =>
  typeof structuredClone !== 'undefined' ? structuredClone(v) : JSON.parse(JSON.stringify(v));

export function createMockStore(overrides: Record<string, unknown> = {}) {
  const state: Record<string, unknown> = {
    activeTab: 'extract',
    theme: 'dark',
    showDataCenterSubmenu: true,
    showKpiAnalyticsSubmenu: true,
    showSettingsSubmenu: true,
    connections: [],
    activeConnectionId: '',
    extractionResult: null,
    masterDatasetInfo: null,
    storageConfig: { provider: 'sqlite', url: '', isCustom: false },
    settings: deepClone(DEFAULT_SETTINGS),
    dateFrom: '',
    dateTo: '',
    region: 'national',
    selectedPeriodPreset: undefined,
    globalFilters: {},
    hiddenDimensions: [],
    dashboardCharts: [
      { id: 'chart-1', kpiId: '', type: 'bar', width: 'full', height: 'md', jqlFilter: { enabled: false, query: '', mode: 'override' }, expanded: true },
    ],
    dashboardJqlQuery: '',
    filterPanelOpen: true,
    showFloatingBar: false,
    kpiResults: [],
    kpiSubTab: 'dashboard',
    customWidgetResults: {},
    calculatingWidgets: [],
    kpiCardConfigs: [],
    jqlResultCache: {},
    savedViews: [],
    activeView: null,
    isViewModified: false,
    widgetTitles: {},
    collapsedWidgets: [],
    widgetHeights: {},
    widgetDisplayOrder: [],
    ...overrides,
  };

  // Mutating setters (also exposed as vi.fns for assertion).
  const setters: Record<string, (v: unknown) => void> = {
    setActiveTab: (v) => { state.activeTab = v as string; },
    setTheme: (v) => { state.theme = v as 'light' | 'dark'; },
    setShowDataCenterSubmenu: (v) => { state.showDataCenterSubmenu = v as boolean; },
    setShowKpiAnalyticsSubmenu: (v) => { state.showKpiAnalyticsSubmenu = v as boolean; },
    setShowSettingsSubmenu: (v) => { state.showSettingsSubmenu = v as boolean; },
    setConnections: (v) => { state.connections = v; },
    setActiveConnectionId: (v) => { state.activeConnectionId = v as string; },
    setExtractionResult: (v) => { state.extractionResult = v; },
    setMasterDatasetInfo: (v) => { state.masterDatasetInfo = v; },
    setStorageConfig: (v) => { state.storageConfig = v; },
    setSettings: (v) => { state.settings = deepClone(v as AppSettings); },
    setDateFrom: (v) => { state.dateFrom = v as string; },
    setDateTo: (v) => { state.dateTo = v as string; },
    setRegion: (v) => { state.region = v as string; },
    setSelectedPeriodPreset: (v) => { state.selectedPeriodPreset = v as string | undefined; },
    setGlobalFilters: (v) => { state.globalFilters = v as Record<string, string[]>; },
    setHiddenDimensions: (v) => {
      const prev = state.hiddenDimensions as string[];
      state.hiddenDimensions = typeof v === 'function' ? (v as (p: string[]) => string[])(prev) : v as string[];
    },
    setDashboardCharts: (v) => { state.dashboardCharts = v; },
    toggleWidgetExpanded: (widgetId) => {
      state.dashboardCharts = (state.dashboardCharts as Array<Record<string, unknown>>).map(chart =>
        chart.id === widgetId ? { ...chart, expanded: chart.expanded === false ? true : false } : chart
      );
    },
    setDashboardJqlQuery: (v) => { state.dashboardJqlQuery = v as string; },
    setFilterPanelOpen: (v) => { state.filterPanelOpen = v as boolean; },
    setShowFloatingBar: (v) => { state.showFloatingBar = v as boolean; },
    setKpiResults: (v) => { state.kpiResults = v; },
    setKpiSubTab: (v) => { state.kpiSubTab = v as string; },
    setCustomWidgetResults: (v) => {
      const prev = state.customWidgetResults as Record<string, unknown>;
      state.customWidgetResults = typeof v === 'function' ? (v as (p: Record<string, unknown>) => Record<string, unknown>)(prev) : v as Record<string, unknown>;
    },
    setCalculatingWidgets: (v) => {
      const prev = state.calculatingWidgets as string[];
      state.calculatingWidgets = typeof v === 'function' ? (v as (p: string[]) => string[])(prev) : v as string[];
    },
    setKpiCardConfigs: (v) => { state.kpiCardConfigs = v; },
    setJqlResultCache: (v) => {
      const prev = state.jqlResultCache as Record<string, unknown>;
      state.jqlResultCache = typeof v === 'function' ? (v as (p: Record<string, unknown>) => Record<string, unknown>)(prev) : v as Record<string, unknown>;
    },
    setSavedViews: (v) => { state.savedViews = v; },
    setActiveView: (v) => { state.activeView = v; },
    setIsViewModified: (v) => { state.isViewModified = v as boolean; },
    setWidgetTitles: (v) => {
      const prev = state.widgetTitles as Record<string, string>;
      state.widgetTitles = typeof v === 'function' ? (v as (p: Record<string, string>) => Record<string, string>)(prev) : v as Record<string, string>;
    },
    setCollapsedWidgets: (v) => {
      const prev = state.collapsedWidgets as string[];
      state.collapsedWidgets = typeof v === 'function' ? (v as (p: string[]) => string[])(prev) : v as string[];
    },
    setWidgetHeights: (v) => {
      const prev = state.widgetHeights as Record<string, number>;
      state.widgetHeights = typeof v === 'function' ? (v as (p: Record<string, number>) => Record<string, number>)(prev) : v as Record<string, number>;
    },
    setWidgetDisplayOrder: (v) => { state.widgetDisplayOrder = v as string[]; },
  };

  for (const [k, impl] of Object.entries(setters)) {
    state[k] = vi.fn(impl as (...args: unknown[]) => void);
  }

  return state;
}

/**
 * Mock for `@/lib/config/local-store`. Every method is a vi.fn with a sensible
 * default; override what a given component needs.
 */
export function createMockLocalConfig(overrides: Record<string, unknown> = {}) {
  return {
    getJiraConnections: vi.fn(() => []),
    saveJiraConnections: vi.fn(),
    getActiveConnectionId: vi.fn(() => ''),
    setActiveConnectionId: vi.fn(),
    getStorageConfig: vi.fn(() => ({ provider: 'sqlite', url: '', isCustom: false })),
    saveStorageConfig: vi.fn(),
    getSettings: vi.fn(() => deepClone(DEFAULT_SETTINGS)),
    saveSettings: vi.fn(),
    getPgConnections: vi.fn(() => []),
    savePgConnections: vi.fn(),
    getKpiPlugins: vi.fn(() => []),
    saveKpiPlugins: vi.fn(),
    getSavedJqls: vi.fn(() => []),
    setSavedJql: vi.fn(),
    getDashboardJqls: vi.fn(() => []),
    getDashboardState: vi.fn(() => null),
    saveDashboardState: vi.fn(),
    getDashboardPresets: vi.fn(() => []),
    getShowDataCenterSubmenu: vi.fn(() => true),
    getShowKpiAnalyticsSubmenu: vi.fn(() => true),
    getShowSettingsSubmenu: vi.fn(() => true),
    setShowDataCenterSubmenu: vi.fn(),
    setShowKpiAnalyticsSubmenu: vi.fn(),
    setShowSettingsSubmenu: vi.fn(),
    getCustomExtractFields: vi.fn(() => []),
    getActivePlugins: vi.fn(() => null),
    saveActivePlugins: vi.fn(),
    getFavoritePlugins: vi.fn(() => []),
    exportConfig: vi.fn(() => ({})),
    importConfig: vi.fn(() => ({ success: true })),
    clear: vi.fn(),
    ...overrides,
  };
}

/** Render wrapped in a fresh QueryClientProvider (retry:false, gcTime:0). */
export function renderWithProviders(
  ui: React.ReactElement,
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }),
) {
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}
