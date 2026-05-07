import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import KpiDashboard from '../KpiDashboard';
import { useAppStore } from '@/store/app-store';
import { useKpiDashboard } from '@/hooks/use-kpi-dashboard';

// Mock the hooks
vi.mock('@/store/app-store', () => ({
  useAppStore: vi.fn(),
}));

vi.mock('@/hooks/use-kpi-dashboard', () => ({
  useKpiDashboard: vi.fn(),
}));

describe('KpiDashboard', () => {
  it('renders "No Active Connection" state when activeConnectionId is null', () => {
    vi.mocked(useAppStore).mockReturnValue({
      activeConnectionId: null,
      theme: 'light',
      globalFilters: {},
      setGlobalFilters: vi.fn(),
      hiddenDimensions: new Set(),
      setHiddenDimensions: vi.fn(),
      dashboardCharts: [],
      setDashboardCharts: vi.fn(),
      dashboardJqlQuery: '',
      setDashboardJqlQuery: vi.fn(),
      kpiResults: [],
      masterDatasetInfo: null,
      filterPanelOpen: false,
      setFilterPanelOpen: vi.fn(),
      dateFrom: '',
      setDateFrom: vi.fn(),
      dateTo: '',
      setDateTo: vi.fn(),
    } as any);
    
    vi.mocked(useKpiDashboard).mockReturnValue({
      calculating: false,
    } as any);

    render(<KpiDashboard />);
    
    expect(screen.getByText(/No Active Connection/i)).toBeInTheDocument();
  });
});
