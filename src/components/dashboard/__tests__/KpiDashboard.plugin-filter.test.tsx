/**
 * KpiDashboard — derived plugin filtering (TDD)
 *
 * Contract under test:
 * - The zustand store's `kpiResults` slice holds the RAW calculation results
 *   (written only by the React Query sync in useKpiCalculations and the
 *   intentional clears in ExtractPanel). KpiDashboard must never write a
 *   plugin-filtered array back into it.
 * - Filtering by active plugins is DERIVED at render time from
 *   (raw kpiResults, active plugins), so toggling plugin visibility changes
 *   what is rendered without touching the store.
 *
 * RED phase: these tests fail against the old implementation, which filtered
 * by mutating the store via a self-referencing effect.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks intentionally untyped */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMockStore, createMockLocalConfig } from '@/test/mock-store';
import { KpiDashboard } from '../KpiDashboard';

// Inlined storage key (mirrors KpiDashboard — the suites in this folder mock
// '@/lib/config/local-store' without a KEYS export).
const ACTIVE_PLUGINS_STORAGE_KEY = 'cfg_active_plugins';

// Render helper that keeps the QueryClientProvider wrapper across rerenders
// (RTL preserves the `wrapper` option on rerender — needed so tests can
// simulate the re-render that follows an active-plugin change).
function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<KpiDashboard />, { wrapper });
}

// ── Store ref (vi.hoisted ref avoids the vitest-4 import-TDZ issue) ──────────
const storeRef = vi.hoisted(() => ({ current: undefined as any }));
vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current),
  getState: () => storeRef.current,
}));

// localConfig read lazily so createMockLocalConfig() can run after imports init.
let localConfigMock: any;
vi.mock('@/lib/config/local-store', () => ({
  get localConfig() {
    return localConfigMock;
  },
}));

// ── Hooks: lazy `let` returns so stable vi.fns can be asserted ─────────────────
let kpiCalcReturn: any;
let jqlFiltersReturn: any;
let pluginVisReturn: any;
let widgetOrderReturn: any;
let drillDownReturn: any;
let periodAnalysisReturn: any;

vi.mock('@/hooks/useKpiCalculations', () => ({ useKpiCalculations: () => kpiCalcReturn }));
vi.mock('@/hooks/useJqlFilters', () => ({ useJqlFilters: () => jqlFiltersReturn }));
vi.mock('@/hooks/usePluginVisibility', () => ({ usePluginVisibility: () => pluginVisReturn }));
vi.mock('@/hooks/useWidgetOrder', () => ({ useWidgetOrder: () => widgetOrderReturn }));
vi.mock('@/hooks/useDrillDown', () => ({ useDrillDown: () => drillDownReturn }));
vi.mock('@/hooks/usePeriodAnalysis', () => ({ usePeriodAnalysis: () => periodAnalysisReturn }));

// ── Chart helpers / jira helpers ──────────────────────────────────────────────
vi.mock('@/lib/chart-data-utils', () => ({
  transformForBarChart: (d: any) => d,
  transformForPieChart: (d: any) => d,
  transformForLineChart: (d: any) => d,
  getKpiOptions: () => ({}),
  getRecommendedChartType: () => 'bar',
  formatChartValue: (v: any) => v,
  isTimeSeriesPlugin: () => false,
  CHART_COLORS: ['#000'],
  getUniqueColor: (i: number) => `c${i}`,
}));
vi.mock('@/lib/jira/field-config', () => ({
  DEFAULT_FIELD_CONFIG: { storyPointsField: 'customfield_10002', issueOwnerTeamField: 'customfield_10132' },
  getIssueOwnerTeamField: () => 'customfield_10132',
  getStoryPointsField: () => 'customfield_10002',
  getFieldConfig: () => ({ storyPointsField: 'customfield_10002', issueOwnerTeamField: 'customfield_10132' }),
}));
vi.mock('@/lib/jira/client', () => ({ extractSelectFieldValue: (v: any) => (typeof v === 'string' ? v : v?.value || '') }));

// ── Child components stubbed to simple divs ────────────────────────────────────
vi.mock('../KpiCard', () => ({
  KpiCard: ({ title, value }: any) => <div data-testid="kpi-card">{title}{value}</div>,
  ChartCard: ({ config }: any) => <div data-testid="chart-card">{config?.id}</div>,
}));
vi.mock('../ViewManager', () => ({ ViewManager: () => <div data-testid="view-manager" /> }));
vi.mock('../KpiDataTable', () => ({
  KpiDataTable: ({ results }: any) => <div data-testid="kpi-data-table">{JSON.stringify(results)}</div>,
}));
vi.mock('../KpiFilterPanel', () => ({ KpiFilterPanel: () => <div data-testid="kpi-filter-panel" /> }));
vi.mock('../WidgetResizeContainer', () => ({ WidgetResizeContainer: ({ children }: any) => <div data-testid="widget-resize">{children}</div> }));
vi.mock('../DrillDownSheet', () => ({ DrillDownSheet: () => <div data-testid="drill-down-sheet" /> }));
vi.mock('../TicketListWidget', () => ({ TicketListWidget: () => <div data-testid="ticket-list-widget" /> }));
vi.mock('../KpiErrorBoundary', () => ({ KpiErrorBoundary: ({ children }: any) => <div>{children}</div> }));

// ── fetch mock (plugin metadata fetch on mount, etc.) ─────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch as any;
function jsonResponse(payload: any, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  });
}

// ── KPI fixtures — two plugins with distinct widget renderings ────────────────
const RESULT_ALPHA = {
  pluginId: 'alpha_metrics',
  name: 'Alpha Metrics',
  // status dimension → renders the "Open Tickets by Status" widget
  results: [{ name: 'Open', value: 3, unit: 'tickets', dimensions: { status: 'Open' } }],
};
const RESULT_BETA = {
  pluginId: 'beta_metrics',
  name: 'Beta Metrics',
  // priority dimension → renders a widget titled via getPluginName ("Beta Metrics")
  results: [{ name: 'High', value: 2, unit: 'tickets', dimensions: { priority: 'High' } }],
};

beforeEach(() => {
  // jsdom lacks URL.createObjectURL — required by handleExportKpis.
  (window.URL as any).createObjectURL = vi.fn(() => 'blob:mock');
  (window.URL as any).revokeObjectURL = vi.fn();

  localConfigMock = createMockLocalConfig({
    getKpiPlugins: vi.fn(() => []),
    getCustomExtractFields: vi.fn(() => []),
    getDashboardJqls: vi.fn(() => []),
    saveDashboardJqls: vi.fn(),
  });
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/kpi/plugins')) return jsonResponse({ success: true, plugins: [] });
    return jsonResponse({ success: true });
  });

  // Plugin visibility mock with a REAL toggle: it mutates activePlugins the way
  // the real hook does when the persisted list changes, so the component can
  // derive newly filtered results from it.
  let activePlugins: string[] = [];
  pluginVisReturn = {
    get activePlugins() {
      return activePlugins;
    },
    filteredPlugins: activePlugins,
    reorderPlugins: vi.fn(),
    togglePluginVisibility: vi.fn((pluginId: string) => {
      activePlugins = activePlugins.includes(pluginId)
        ? activePlugins.filter(id => id !== pluginId)
        : [...activePlugins, pluginId];
    }),
    setPluginFilter: vi.fn(),
  };
  // Helper for tests to seed the persisted-plugin state.
  pluginVisReturn._setActivePlugins = (ids: string[]) => {
    activePlugins = [...ids];
  };

  kpiCalcReturn = {
    kpiResults: [],
    customWidgetResults: {},
    isCalculating: false,
    isError: false,
    error: null,
    pollingEnabled: false,
    triggerCalculation: vi.fn(() => Promise.resolve()),
    setPollingEnabled: vi.fn(),
    refetch: vi.fn(),
  };
  jqlFiltersReturn = {
    jqlList: [],
    stagingFilters: {},
    addJql: vi.fn(),
    editJql: vi.fn(),
    deleteJql: vi.fn(),
    toggleStagingFilter: vi.fn(),
    clearStagingFilters: vi.fn(),
    applyStagingFilters: vi.fn(() => ({})),
  };
  widgetOrderReturn = {
    widgetOrder: [] as string[],
    reorderWidget: vi.fn(),
    // Functional append (mirrors the persisted-list toggle) so the widget-order
    // sync effect inside KpiDashboard can register new plugins.
    toggleWidgetVisibility: vi.fn((id: string) => {
      widgetOrderReturn.widgetOrder = widgetOrderReturn.widgetOrder.includes(id)
        ? widgetOrderReturn.widgetOrder.filter((x: string) => x !== id)
        : [...widgetOrderReturn.widgetOrder, id];
    }),
    isWidgetVisible: () => true,
    getWidgetDefinitions: () => [],
    initializeWidgetOrder: vi.fn(),
  };
  drillDownReturn = {
    drillDownKeys: null,
    drillDownTitle: '',
    isDrillDownOpen: false,
    openDrillDown: vi.fn(),
    closeDrillDown: vi.fn(),
  };
  periodAnalysisReturn = {
    presetPeriod: null,
    requiresTruncation: false,
    availableStartDate: null,
    isPresetRange: false,
    validateDateRange: () => true,
  };

  window.localStorage.clear();
});

describe('KpiDashboard - derived plugin filtering (no store mutation)', () => {
  it('shows only widgets for configured active plugins and never writes filtered results to the store', async () => {
    window.localStorage.setItem(ACTIVE_PLUGINS_STORAGE_KEY, JSON.stringify(['alpha_metrics']));
    pluginVisReturn._setActivePlugins(['alpha_metrics']);
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [RESULT_ALPHA, RESULT_BETA],
    });
    renderDashboard();
    await screen.findByText('KPI Analytics');

    // Alpha's widget is visible…
    expect(await screen.findByText('Open Tickets by Status')).toBeInTheDocument();
    // …beta's widget is filtered out at render time.
    expect(screen.queryByText('Beta Metrics')).not.toBeInTheDocument();

    // The store slice must remain the RAW results; no filtered write-back.
    expect(storeRef.current.kpiResults).toEqual([RESULT_ALPHA, RESULT_BETA]);
    expect(storeRef.current.setKpiResults).not.toHaveBeenCalled();
    // Chart configs must not be mutated either.
    expect(storeRef.current.setDashboardCharts).not.toHaveBeenCalled();
  });

  it('toggling an active plugin updates visible widgets without mutating the store kpiResults', async () => {
    window.localStorage.setItem(ACTIVE_PLUGINS_STORAGE_KEY, JSON.stringify(['alpha_metrics', 'beta_metrics']));
    pluginVisReturn._setActivePlugins(['alpha_metrics', 'beta_metrics']);
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [RESULT_ALPHA, RESULT_BETA],
    });
    const { rerender } = renderDashboard();
    await screen.findByText('KPI Analytics');

    // Both widgets visible initially.
    expect(await screen.findByText('Open Tickets by Status')).toBeInTheDocument();
    expect(await screen.findByText('Beta Metrics')).toBeInTheDocument();

    // Toggle beta off (the persisted active-plugin list drives the derivation).
    // The rerender models the state update the real usePluginVisibility hook
    // performs when the persisted list changes.
    act(() => {
      pluginVisReturn.togglePluginVisibility('beta_metrics');
    });
    rerender(<KpiDashboard />);

    // Beta's widget disappears, alpha stays.
    await waitFor(() => expect(screen.queryByText('Beta Metrics')).not.toBeInTheDocument());
    expect(screen.getByText('Open Tickets by Status')).toBeInTheDocument();

    // Store untouched: raw results intact, no setter calls from the component.
    expect(storeRef.current.kpiResults).toEqual([RESULT_ALPHA, RESULT_BETA]);
    expect(storeRef.current.setKpiResults).not.toHaveBeenCalled();
  });

  it('toggling a plugin back on restores its widget from the untouched raw results', async () => {
    window.localStorage.setItem(ACTIVE_PLUGINS_STORAGE_KEY, JSON.stringify(['alpha_metrics']));
    pluginVisReturn._setActivePlugins(['alpha_metrics']);
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [RESULT_ALPHA, RESULT_BETA],
    });
    const { rerender } = renderDashboard();
    await screen.findByText('KPI Analytics');

    expect(await screen.findByText('Open Tickets by Status')).toBeInTheDocument();
    expect(screen.queryByText('Beta Metrics')).not.toBeInTheDocument();

    // Re-enable beta — because the store was never filtered, the widget can
    // reappear without any recalculation.
    act(() => {
      pluginVisReturn.togglePluginVisibility('beta_metrics');
    });
    rerender(<KpiDashboard />);

    expect(await screen.findByText('Beta Metrics')).toBeInTheDocument();
    expect(storeRef.current.kpiResults).toEqual([RESULT_ALPHA, RESULT_BETA]);
    expect(storeRef.current.setKpiResults).not.toHaveBeenCalled();
  });

  it('deselecting all plugins hides the results UI but keeps raw results in the store', async () => {
    window.localStorage.setItem(ACTIVE_PLUGINS_STORAGE_KEY, JSON.stringify([]));
    pluginVisReturn._setActivePlugins([]);
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [RESULT_ALPHA, RESULT_BETA],
    });
    renderDashboard();
    await screen.findByText('KPI Analytics');

    // Nothing derived from results is rendered (no table, no widgets).
    await waitFor(() => expect(screen.queryByTestId('kpi-data-table')).not.toBeInTheDocument());
    expect(screen.queryByText('Open Tickets by Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Beta Metrics')).not.toBeInTheDocument();

    // RAW results survive — re-enabling plugins must not require a recalculation.
    expect(storeRef.current.kpiResults).toEqual([RESULT_ALPHA, RESULT_BETA]);
    expect(storeRef.current.setKpiResults).not.toHaveBeenCalled();
  });

  it('shows all plugins in original order when the active-plugin list was never configured', async () => {
    // No cfg_active_plugins key in localStorage.
    pluginVisReturn._setActivePlugins(['alpha_metrics', 'beta_metrics']);
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [RESULT_ALPHA, RESULT_BETA],
    });
    renderDashboard();
    await screen.findByText('KPI Analytics');

    expect(await screen.findByText('Open Tickets by Status')).toBeInTheDocument();
    expect(await screen.findByText('Beta Metrics')).toBeInTheDocument();
    expect(storeRef.current.setKpiResults).not.toHaveBeenCalled();
  });

  it('exports only the derived (visible) KPI results to CSV', async () => {
    window.localStorage.setItem(ACTIVE_PLUGINS_STORAGE_KEY, JSON.stringify(['alpha_metrics']));
    pluginVisReturn._setActivePlugins(['alpha_metrics']);
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [RESULT_ALPHA, RESULT_BETA],
    });
    renderDashboard();
    await screen.findByText('KPI Analytics');

    // Capture the CSV blob content when the export link is clicked.
    let csvContent = '';
    const OriginalBlob = window.Blob;
    // Must be constructable — the component calls `new Blob(...)`.
    const blobSpy = vi.fn(function (parts: BlobPart[], options?: BlobPropertyBag) {
      csvContent = parts.map(p => String(p)).join('');
      return new OriginalBlob(parts, options);
    });
    vi.stubGlobal('Blob', blobSpy);

    try {
      const exportBtn = await screen.findByRole('button', { name: /export csv/i });
      await act(async () => {
        exportBtn.click();
      });

      await waitFor(() => expect(blobSpy).toHaveBeenCalled());
      expect(csvContent).toContain('alpha_metrics');
      expect(csvContent).not.toContain('beta_metrics');
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
