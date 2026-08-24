import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { createMockStore, createMockLocalConfig, renderWithProviders } from '@/test/mock-store';
import { KpiDashboard } from '../KpiDashboard';

// ── Store ref (vi.hoisted ref avoids the vitest-4 import-TDZ issue) ──────────
const storeRef = vi.hoisted(() => ({ current: undefined as any }));
vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current),
  getState: () => storeRef.current,
}));

// localConfig read lazily so createMockLocalConfig() can run after imports init.
// @MX:NOTE: Spread the real module so KEYS (and other exports) stay available —
// KpiDashboard/useWidgetOrder read KEYS.activePlugins / KEYS.widgetOrder.
let localConfigMock: any;
vi.mock('@/lib/config/local-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/config/local-store')>();
  return {
    ...actual,
    get localConfig() {
      return localConfigMock;
    },
  };
});

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
  dedupeChartsById: <T extends { id?: string }>(charts: T[]) => {
    const seen = new Set<string>();
    return charts.filter((c) => {
      if (!c?.id) return true;
      if (seen.has(c.id)) return false;
      seen.add(c.id);
      return true;
    });
  },
}));
vi.mock('@/lib/jira/field-config', () => ({
  DEFAULT_FIELD_CONFIG: { storyPointsField: 'customfield_10002', issueOwnerTeamField: 'customfield_10132' },
  getIssueOwnerTeamField: () => 'customfield_10132',
  getStoryPointsField: () => 'customfield_10002',
  getFieldConfig: () => ({ storyPointsField: 'customfield_10002', issueOwnerTeamField: 'customfield_10132' }),
}));
vi.mock('@/lib/jira/client', () => ({ extractSelectFieldValue: (v: any) => (typeof v === 'string' ? v : v?.value || '') }));

// ── Child components stubbed to simple divs (KpiCard/ChartCard incl. data-testid) ─
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

// Stable hook return objects (assigned once, after imports init).
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
pluginVisReturn = {
  activePlugins: ['plugin-test-plugin'],
  filteredPlugins: ['plugin-test-plugin'],
  reorderPlugins: vi.fn(),
  togglePluginVisibility: vi.fn(),
  setPluginFilter: vi.fn(),
};
widgetOrderReturn = {
  widgetOrder: [],
  reorderWidget: vi.fn(),
  toggleWidgetVisibility: vi.fn(),
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

const KPI_RESULT = {
  pluginId: 'test-plugin',
  name: 'Test KPI',
  results: [{ name: 'Result A', value: 10, unit: 'tickets' }],
};

beforeEach(() => {
  localConfigMock = createMockLocalConfig({
    getKpiPlugins: vi.fn(() => []),
    getCustomExtractFields: vi.fn(() => []),
    getDashboardJqls: vi.fn(() => []),
    saveDashboardJqls: vi.fn(),
    getSettings: vi.fn(() => ({
      rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
      general: { defaultHolidayState: 'national', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
      persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
      sla: { statusTargets: {}, useAnyoneCommentsForSla: false },
      alerts: { thresholds: {} },
      webhooks: { enabled: false, url: '', secret: '' },
    })),
  });
  mockFetch.mockReset();
  mockFetch.mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/kpi/plugins')) return jsonResponse({ success: true, plugins: [] });
    return jsonResponse({ success: true });
  });
  // Reset call history on stable hook fns; clear localStorage so sortedKpiResults
  // treats cfg_active_plugins as "never configured" (shows all kpiResults).
  kpiCalcReturn.triggerCalculation.mockClear();
  window.localStorage.clear();
});

describe('KpiDashboard - deeper component tests', () => {
  it('renders the KPI Analytics heading and a Recalculate button', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1' });
    renderWithProviders(<KpiDashboard />);

    expect(await screen.findByText('KPI Analytics')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /recalculate/i })).toBeInTheDocument();
  });

  it('clicking the 7D preset sets dateFrom/dateTo and the preset label', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1' });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    fireEvent.click(screen.getByRole('button', { name: '7D' }));

    const store = storeRef.current;
    expect(store.setDateFrom).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(store.setDateTo).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(store.setSelectedPeriodPreset).toHaveBeenCalledWith('7D');
    expect(store.dateFrom).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('clicking the 30D preset sets dateFrom/dateTo and the preset label', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1' });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    fireEvent.click(screen.getByRole('button', { name: '30D' }));

    const store = storeRef.current;
    expect(store.setDateFrom).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(store.setDateTo).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(store.setSelectedPeriodPreset).toHaveBeenCalledWith('30D');
  });

  it('clicking the MAX preset uses the master dataset date range', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      masterDatasetInfo: {
        totalExtracted: 5,
        dateRange: { from: '2026-01-01', to: '2026-01-31' },
        lastUpdated: '2026-01-31T00:00:00Z',
        issues: [],
      },
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    fireEvent.click(screen.getByRole('button', { name: 'MAX' }));

    const store = storeRef.current;
    expect(store.setDateFrom).toHaveBeenCalledWith('2026-01-01');
    expect(store.setDateTo).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(store.setSelectedPeriodPreset).toHaveBeenCalledWith('MAX');
  });

  it('Filters button toggles filterPanelOpen', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', filterPanelOpen: false });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    // Panel hidden initially.
    expect(screen.queryByTestId('kpi-filter-panel')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /filters/i }));

    expect(storeRef.current.setFilterPanelOpen).toHaveBeenCalledWith(true);
  });

  it('renders the KpiFilterPanel when filterPanelOpen is true', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', filterPanelOpen: true });
    renderWithProviders(<KpiDashboard />);

    expect(await screen.findByTestId('kpi-filter-panel')).toBeInTheDocument();
  });

  it('clicking Recalculate invokes the calculation hook', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1' });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    fireEvent.click(screen.getByRole('button', { name: /recalculate/i }));

    await waitFor(() => expect(kpiCalcReturn.triggerCalculation).toHaveBeenCalled());
  });

  it('renders a KpiResult (KpiDataTable) and a ChartCard when kpiResults exist', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [KPI_RESULT],
    });
    renderWithProviders(<KpiDashboard />);

    const table = await screen.findByTestId('kpi-data-table');
    expect(table).toBeInTheDocument();
    expect(table.textContent).toContain('test-plugin');
    // Visualizations section renders a ChartCard stub for the default chart.
    expect(screen.getByTestId('chart-card')).toBeInTheDocument();
    // Empty-state card is not shown when results exist.
    expect(screen.queryByText(/No KPI results yet/i)).not.toBeInTheDocument();
  });
});
