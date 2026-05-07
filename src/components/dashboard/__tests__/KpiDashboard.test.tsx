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
    (useAppStore as any).mockReturnValue({
      activeConnectionId: null,
      theme: 'light',
    });
    
    (useKpiDashboard as any).mockReturnValue({
      calculating: false,
    });

    render(<KpiDashboard />);
    
    expect(screen.getByText(/No Active Connection/i)).toBeInTheDocument();
  });
});
