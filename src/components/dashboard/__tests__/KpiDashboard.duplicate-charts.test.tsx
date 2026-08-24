/**
 * KpiDashboard — duplicate chart-id robustness (regression)
 *
 * Persisted dashboard state (localStorage restores, saved views, imported
 * configs) can contain two chart configs with the SAME id — e.g. the
 * `chart-resolution-by-priority` collision reported after the phase-8 merge.
 * React keys must be unique; duplicate keys log
 * "Encountered two children with the same key" and can duplicate/drop
 * children. KpiDashboard must dedupe by id at render time.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- test mocks intentionally untyped */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMockStore, createMockLocalConfig } from '@/test/mock-store';
import { KpiDashboard } from '../KpiDashboard';

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return render(<KpiDashboard />, { wrapper });
}

const storeRef = vi.hoisted(() => ({ current: undefined as any }));
vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current),
  getState: () => storeRef.current,
}));

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

vi.mock('@/lib/chart-data-utils', async (importOriginal) => {
  // Keep dedupeChartsById REAL (it is the behavior under test); stub the rest.
  const actual = await importOriginal<typeof import('@/lib/chart-data-utils')>();
  return {
    ...actual,
    transformForBarChart: (d: any) => d,
    transformForPieChart: (d: any) => d,
    transformForLineChart: (d: any) => d,
    getKpiOptions: () => ({}),
    getRecommendedChartType: () => 'bar',
    formatChartValue: (v: any) => v,
    isTimeSeriesPlugin: () => false,
    CHART_COLORS: ['#000'],
    getUniqueColor: (i: number) => `c${i}`,
  };
});
vi.mock('@/lib/jira/field-config', () => ({
  DEFAULT_FIELD_CONFIG: { storyPointsField: 'customfield_10002', issueOwnerTeamField: 'customfield_10132' },
  getIssueOwnerTeamField: () => 'customfield_10132',
  getStoryPointsField: () => 'customfield_10002',
  getFieldConfig: () => ({ storyPointsField: 'customfield_10002', issueOwnerTeamField: 'customfield_10132' }),
}));
vi.mock('@/lib/jira/client', () => ({ extractSelectFieldValue: (v: any) => (typeof v === 'string' ? v : v?.value || '') }));

// ChartCard stub renders the config id so duplicates are countable.
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

const chartConfig = (id: string) => ({
  id,
  kpiId: '',
  type: 'bar',
  width: 'md',
  height: 'md',
  jqlFilter: { enabled: false, query: '', mode: 'override' },
});

// The widgets/charts section only renders when there is at least one KPI
// result (KpiDashboard gates it on filteredKpiResults.length > 0).
const MINIMAL_RESULT = {
  pluginId: 'alpha_metrics',
  name: 'Alpha Metrics',
  results: [{ name: 'Open', value: 1, unit: 'tickets', dimensions: { status: 'Open' } }],
};

let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
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

  pluginVisReturn = {
    activePlugins: [],
    filteredPlugins: [],
    reorderPlugins: vi.fn(),
    togglePluginVisibility: vi.fn(),
    setPluginFilter: vi.fn(),
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

  window.localStorage.clear();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

describe('KpiDashboard - duplicate chart ids in persisted state', () => {
  it('renders one card per unique id and emits no duplicate-key warning', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [MINIMAL_RESULT],
      // The reported collision: two configs share `chart-resolution-by-priority`.
      dashboardCharts: [
        chartConfig('chart-resolution-by-priority'),
        chartConfig('chart-unique'),
        chartConfig('chart-resolution-by-priority'),
      ],
    });
    renderDashboard();
    await screen.findByText('KPI Analytics');

    const cards = await screen.findAllByTestId('chart-card');
    const ids = cards.map((c) => c.textContent);
    expect(ids.filter((id) => id === 'chart-resolution-by-priority')).toHaveLength(1);
    expect(ids.filter((id) => id === 'chart-unique')).toHaveLength(1);

    const keyWarnings = consoleErrorSpy.mock.calls.filter((args: unknown[]) =>
      args.some((a: unknown) => typeof a === 'string' && a.includes('same key')),
    );
    expect(keyWarnings).toHaveLength(0);
  });

  it('keeps rendering all unique charts when there are no duplicates', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      kpiResults: [MINIMAL_RESULT],
      dashboardCharts: [chartConfig('chart-a'), chartConfig('chart-b'), chartConfig('chart-c')],
    });
    renderDashboard();
    await screen.findByText('KPI Analytics');

    const cards = await screen.findAllByTestId('chart-card');
    expect(cards.map((c) => c.textContent)).toEqual(['chart-a', 'chart-b', 'chart-c']);
  });
});
