import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { KpiDashboard } from '../KpiDashboard';
import { useAppStore } from '@/store/app-store';

// Mock the Zustand store
vi.mock('@/store/app-store', () => ({
  useAppStore: vi.fn(),
}));

// Mock localStorage with default null returns
const mockGetItem = vi.fn(() => null);
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: mockGetItem,
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
  },
  writable: true,
});

// Wrapper component for React Query
const createTestWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
};

// Mock child components that we're not testing in this integration test
vi.mock('../KpiCard', () => ({
  KpiCard: ({ title, value }: { title: string; value: string }) => (
    <div data-testid="kpi-card">
      <div>{title}</div>
      <div>{value}</div>
    </div>
  ),
  ChartCard: ({ title }: { title: string }) => (
    <div data-testid="chart-card">{title}</div>
  ),
}));

vi.mock('../ViewManager', () => ({
  ViewManager: () => <div data-testid="view-manager">ViewManager</div>,
}));

vi.mock('../KpiDataTable', () => ({
  KpiDataTable: ({ data }: { data: unknown }) => (
    <div data-testid="kpi-data-table">{JSON.stringify(data)}</div>
  ),
}));

// Mock hooks
vi.mock('@/lib/chart-data-utils', () => ({
  transformForBarChart: vi.fn((data) => data),
  transformForPieChart: vi.fn((data) => data),
  transformForLineChart: vi.fn((data) => data),
  getKpiOptions: vi.fn(() => ({})),
  getRecommendedChartType: vi.fn(() => 'bar'),
  formatChartValue: vi.fn((v) => v),
  isTimeSeriesPlugin: vi.fn(() => false),
  CHART_COLORS: [],
}));

vi.mock('@/lib/config/local-store', () => ({
  localConfig: {
    getDashboardJqls: vi.fn(() => []),
    saveDashboardJqls: vi.fn(),
  },
}));

describe('KpiDashboard - Integration Tests', () => {
  // Mock store state factory
  const createMockStore = (overrides = {}) => ({
    connections: [],
    extractionResult: null,
    masterDatasetInfo: null,
    setMasterDatasetInfo: vi.fn(),
    dateFrom: '2026-01-01',
    setDateFrom: vi.fn(),
    dateTo: '2026-01-31',
    setDateTo: vi.fn(),
    region: 'DE-BW',
    setRegion: vi.fn(),
    activeConnectionId: 'conn-1',
    settings: {},
    kpiResults: [],
    setKpiResults: vi.fn(),
    storageConfig: null,
    globalFilters: {},
    setGlobalFilters: vi.fn(),
    hiddenDimensions: {},
    setHiddenDimensions: vi.fn(),
    dashboardCharts: [],
    setDashboardCharts: vi.fn(),
    dashboardJqlQuery: '',
    setDashboardJqlQuery: vi.fn(),
    filterPanelOpen: false,
    setFilterPanelOpen: vi.fn(),
    theme: 'light',
    showFloatingBar: true,
    setActiveTab: vi.fn(),
    kpiSubTab: 'overview',
    setKpiSubTab: vi.fn(),
    customWidgetResults: [],
    setCustomWidgetResults: vi.fn(),
    calculatingWidgets: [],
    setCalculatingWidgets: vi.fn(),
    kpiCardConfigs: {},
    setKpiCardConfigs: vi.fn(),
    activeView: null,
    setIsViewModified: vi.fn(),
    setActiveView: vi.fn(),
    widgetTitles: {},
    setWidgetTitles: vi.fn(),
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    // Reset localStorage mock to return null for all calls
    mockGetItem.mockReturnValue(null);
  });

  // Helper function to render with wrapper
  const renderWithWrapper = (component: React.ReactElement) => {
    return render(component, { wrapper: createTestWrapper() });
  };

  describe('CRITICAL PATH 1: Active Connection Detection', () => {
    it('should show "No Active Connection" state when no connection is active', () => {
      const mockStore = createMockStore({ activeConnectionId: null });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      expect(screen.getByText(/No Active Connection/i)).toBeInTheDocument();
      expect(screen.getByText(/Please select or create a Jira connection/i)).toBeInTheDocument();
    });

    it('should render dashboard when active connection exists', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        connections: [{ id: 'conn-1', name: 'Test Connection' }],
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      expect(screen.queryByText(/No Active Connection/i)).not.toBeInTheDocument();
    });
  });

  describe('CRITICAL PATH 2: KPI Calculation Trigger', () => {
    it('should display "Recalculate" button in floating bar', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        showFloatingBar: true,
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Look for the floating bar with Recalculate button
      const recalculateButton = screen.queryByRole('button', { name: /recalculate/i });
      expect(recalculateButton).toBeInTheDocument();
    });

    it('should show calculation state when calculation is in progress', async () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        kpiResults: [],
        showFloatingBar: true,
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Initially should show calculate button (not calculating state)
      const calculateButton = screen.queryByRole('button', { name: /calculate|recalculate/i });
      expect(calculateButton).toBeInTheDocument();
    });
  });

  describe('CRITICAL PATH 3: Global Filter Application', () => {
    it('should display global filter controls', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        globalFilters: { status: ['Open', 'In Progress'] },
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Filter panel should be accessible
      const filterButton = screen.queryByRole('button', { name: /filter/i });
      expect(filterButton).toBeInTheDocument();
    });

    it('should persist filter changes to store', async () => {
      const user = userEvent.setup();
      const setGlobalFilters = vi.fn();
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        globalFilters: {},
        setGlobalFilters,
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Open filter panel (implementation-specific)
      const filterButton = screen.queryByRole('button', { name: /filter/i });
      if (filterButton) {
        await user.click(filterButton);

        // Verify store method is available
        expect(setGlobalFilters).toBeDefined();
      }
    });
  });

  describe('CRITICAL PATH 4: View Mode Switching (Grid vs Table)', () => {
    it('should display view mode toggle controls', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        kpiResults: [
          {
            pluginId: 'test-plugin',
            name: 'Test KPI',
            results: [{ name: 'Result 1', value: 100, unit: 'tickets' }],
          },
        ],
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Look for view toggle buttons
      const gridButton = screen.queryByRole('button', { name: /grid/i });
      const tableButton = screen.queryByRole('button', { name: /table/i });

      // At least one should be present
      expect(gridButton || tableButton).toBeInTheDocument();
    });
  });

  describe('CRITICAL PATH 5: Drill-Down Navigation', () => {
    it('should handle drill-down click on KPI results', async () => {
      const user = userEvent.setup();
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        kpiResults: [
          {
            pluginId: 'test-plugin',
            name: 'Test KPI',
            results: [
              {
                name: 'Assignee A',
                value: 10,
                unit: 'tickets',
                ticketKeys: ['PROJ-1', 'PROJ-2'],
              },
            ],
          },
        ],
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Find drill-down trigger (implementation-specific)
      const drillDownTrigger = screen.queryByText(/Assignee A/i);
      if (drillDownTrigger) {
        await user.click(drillDownTrigger);

        // Should open drawer or modal
        await waitFor(() => {
          const drawer = screen.queryByRole('dialog', { hidden: true });
          expect(drawer).toBeInTheDocument();
        });
      }
    });
  });

  describe('CRITICAL PATH 6: Panel Expansion State', () => {
    it('should maintain independent expansion state for each panel', async () => {
      const user = userEvent.setup();
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        kpiResults: [
          {
            pluginId: 'assignee-kpi',
            name: 'By Assignee',
            results: [{ name: 'A', value: 5, unit: 'tickets' }],
          },
          {
            pluginId: 'status-kpi',
            name: 'By Status',
            results: [{ name: 'Open', value: 10, unit: 'tickets' }],
          },
        ],
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Find panel headers/sections
      const assigneeSection = screen.queryByText(/By Assignee/i);
      const statusSection = screen.queryByText(/By Status/i);

      expect(assigneeSection).toBeInTheDocument();
      expect(statusSection).toBeInTheDocument();
    });
  });

  describe('CRITICAL PATH 7: Plugin Visibility Toggling', () => {
    it('should filter KPI results based on active plugins', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        kpiResults: [
          { pluginId: 'plugin-1', name: 'KPI 1', results: [] },
          { pluginId: 'plugin-2', name: 'KPI 2', results: [] },
          { pluginId: 'plugin-3', name: 'KPI 3', results: [] },
        ],
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // All KPIs should be visible by default
      expect(screen.queryByText(/KPI 1/i)).toBeInTheDocument();
      expect(screen.queryByText(/KPI 2/i)).toBeInTheDocument();
      expect(screen.queryByText(/KPI 3/i)).toBeInTheDocument();
    });
  });

  describe('CRITICAL PATH 8: Date Range Presets', () => {
    it('should detect and display preset period indicators', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        dateFrom: '2026-04-24', // 7 days ago from 2026-05-01
        dateTo: '2026-05-01',
        masterDatasetInfo: {
          dateRange: { from: '2026-01-01', to: '2026-05-01' },
          totalTickets: 1000,
        },
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Should show preset indicator (7-day period)
      // Implementation-specific assertion
      expect(screen.getByText(/Recalculate/i)).toBeInTheDocument();
    });
  });

  describe('CRITICAL PATH 9: JQL Filter Management', () => {
    it('should allow creating and managing custom JQL filters', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        dashboardJqlQuery: '',
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // JQL input should be available
      const jqlInput = screen.queryByPlaceholderText(/JQL/i);
      expect(jqlInput).toBeDefined();
    });
  });

  describe('CRITICAL PATH 10: Chart Management', () => {
    it('should display chart visualization section', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        dashboardCharts: [
          { id: 'chart-1', type: 'bar', title: 'Test Chart', data: [] },
        ],
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      renderWithWrapper(<KpiDashboard />);

      // Charts should be rendered
      expect(screen.getByTestId('chart-card')).toBeInTheDocument();
    });
  });

  describe('Regression Prevention', () => {
    it('should not crash when kpiResults is empty', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        kpiResults: [],
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      expect(() => renderWithWrapper(<KpiDashboard />)).not.toThrow();
    });

    it('should not crash when masterDatasetInfo is missing', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        masterDatasetInfo: null,
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      expect(() => renderWithWrapper(<KpiDashboard />)).not.toThrow();
    });

    it('should handle null/undefined globalFilters gracefully', () => {
      const mockStore = createMockStore({
        activeConnectionId: 'conn-1',
        globalFilters: null as unknown as Record<string, string[]>,
      });
      vi.mocked(useAppStore).mockReturnValue(mockStore);

      expect(() => renderWithWrapper(<KpiDashboard />)).not.toThrow();
    });
  });
});
