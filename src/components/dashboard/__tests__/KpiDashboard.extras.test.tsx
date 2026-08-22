import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { createMockStore, createMockLocalConfig, renderWithProviders } from '@/test/mock-store';
import { KpiDashboard } from '../KpiDashboard';

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

// window.print / URL.createObjectURL are not implemented in jsdom.
const printSpy = vi.fn();
const createObjectUrlSpy = vi.fn(() => 'blob:mock');
beforeEach(() => {
  vi.stubGlobal('print', printSpy);
  // jsdom lacks URL.createObjectURL — required by handleExportKpis.
  (window.URL as any).createObjectURL = createObjectUrlSpy;
  (window.URL as any).revokeObjectURL = vi.fn();

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
  kpiCalcReturn.triggerCalculation.mockClear();
  printSpy.mockClear();
  createObjectUrlSpy.mockClear();
  window.localStorage.clear();
});

describe('KpiDashboard - extras (filter/collapse/export/empty/view state)', () => {
  it('shows the active-filter badge count on the Filters button when globalFilters exist', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      globalFilters: { status: ['Open', 'Done'] },
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    const filtersBtn = screen.getByRole('button', { name: /filters/i });
    // Object.values(globalFilters).flat().length === 2
    expect(within(filtersBtn).getByText('2')).toBeInTheDocument();
  });

  it('does not render a filter badge when globalFilters is empty', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', globalFilters: {} });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    const filtersBtn = screen.getByRole('button', { name: /filters/i });
    expect(within(filtersBtn).queryByText('2')).not.toBeInTheDocument();
    expect(within(filtersBtn).queryByText('0')).not.toBeInTheDocument();
  });

  it('the Print button calls window.print()', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1' });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    fireEvent.click(screen.getByRole('button', { name: /print/i }));
    expect(printSpy).toHaveBeenCalledTimes(1);
  });

  it('the Export CSV button triggers a CSV blob download (createObjectURL)', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [KPI_RESULT],
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    const exportBtn = screen.getByRole('button', { name: /export csv/i });
    fireEvent.click(exportBtn);
    await waitFor(() => expect(createObjectUrlSpy).toHaveBeenCalled());
  });

  it('renders the empty-results state when kpiResults is empty', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', kpiResults: [] });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    expect(await screen.findByText('No KPI results yet')).toBeInTheDocument();
    // Metrics overview section is gated on results — table/Export CSV absent.
    expect(screen.queryByTestId('kpi-data-table')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
  });

  it('clicking the Metrics Overview header toggles collapse and marks view modified', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [KPI_RESULT],
      collapsedWidgets: new Set<string>(),
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    const header = screen.getByRole('button', { name: /Metrics Overview/i });
    fireEvent.click(header);

    const store = storeRef.current;
    expect(store.setCollapsedWidgets).toHaveBeenCalled();
    expect(store.setIsViewModified).toHaveBeenCalledWith(true);
  });

  it('hides Export CSV and shows a row count when the metrics-overview widget is collapsed', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [KPI_RESULT],
      collapsedWidgets: new Set<string>(['metrics-overview']),
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    expect(screen.queryByRole('button', { name: /export csv/i })).not.toBeInTheDocument();
    // Collapsed state surfaces a "(N rows)" hint next to the header.
    expect(screen.getByText(/\(\d+ rows\)/)).toBeInTheDocument();
  });

  it('shows Export CSV when the metrics-overview widget is expanded', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [KPI_RESULT],
      collapsedWidgets: new Set<string>(),
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });

  it('marks the view unmodified on mount when no view is active', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', activeView: null });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    expect(storeRef.current.setIsViewModified).toHaveBeenCalledWith(false);
  });

  it('marks the view modified when active view data differs from current state', async () => {
    const savedData = {
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      selectedPeriodPreset: undefined,
      region: 'DE-BW', // differs from the store's 'national'
      globalFilters: {},
      charts: [
        { id: 'chart-1', kpiId: '', type: 'bar', width: 'full', height: 'md', jqlFilter: { enabled: false, query: '', mode: 'override' }, expanded: true },
      ],
      dashboardJqlQuery: '',
      kpiCardConfigs: [],
      hiddenDimensions: [],
      widgetTitles: {},
      collapsedWidgets: [],
      widgetHeights: {},
    };
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      activeView: { id: 'view-1', name: 'My View', autoSaveEnabled: false, data: JSON.stringify(savedData) },
      region: 'national',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    await waitFor(() => expect(storeRef.current.setIsViewModified).toHaveBeenCalledWith(true));
  });

  it('renders the floating bar with the active filter count when shown', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      showFloatingBar: true,
      globalFilters: { status: ['Open', 'Done', 'Blocked'] },
    });
    renderWithProviders(<KpiDashboard />);
    await screen.findByText('KPI Analytics');

    // Floating bar surfaces "{N} Filters".
    expect(screen.getByText(/3 Filters/i)).toBeInTheDocument();
  });
});
