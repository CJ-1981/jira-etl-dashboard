import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { SimpleModeWizard, shouldShowSimpleModeWizard } from '../SimpleModeWizard';
import { createMockStore, renderWithProviders } from '@/test/mock-store';

// ── Store ref (vi.hoisted avoids the vitest-4 import-TDZ issue) ──────────────
interface WizardMockState {
  activeTab: string;
  activeConnectionId: string;
  dateFrom: string;
  dateTo: string;
  [key: string]: unknown;
}
const storeRef = vi.hoisted(() => ({ current: undefined as undefined | WizardMockState }));
vi.mock('@/store/app-store', () => {
  const useAppStore = (sel?: unknown) =>
    typeof sel === 'function' ? (sel as (s: unknown) => unknown)(storeRef.current) : storeRef.current;
  useAppStore.getState = () => storeRef.current;
  return { useAppStore, getState: () => storeRef.current };
});

interface LocalConfigMock {
  getUiMode: ReturnType<typeof vi.fn>;
  getJiraConnections: ReturnType<typeof vi.fn>;
  getDemoMode: ReturnType<typeof vi.fn>;
  saveDemoMode: ReturnType<typeof vi.fn>;
}
let localConfigMock: LocalConfigMock;
vi.mock('@/lib/config/local-store', () => ({
  get localConfig() {
    return localConfigMock;
  },
}));

vi.mock('@/lib/datasource/demo-data', () => ({ DEMO_CONNECTION_ID: 'demo' }));

function setup(overrides: Record<string, unknown> = {}) {
  localConfigMock = {
    getUiMode: vi.fn(() => 'simple'),
    getJiraConnections: vi.fn(() => []),
    getDemoMode: vi.fn(() => false),
    saveDemoMode: vi.fn(),
    ...overrides,
  };
  storeRef.current = createMockStore({
    connections: [],
    activeConnectionId: '',
    ...overrides,
  }) as unknown as WizardMockState;
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('SimpleModeWizard', () => {
  it('renders when no connection is configured and demo is off', () => {
    setup();
    renderWithProviders(<SimpleModeWizard />);
    expect(screen.getByText('Welcome to Jira ETL Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Set up Jira connection')).toBeInTheDocument();
    expect(screen.getByText('Try demo data')).toBeInTheDocument();
    expect(shouldShowSimpleModeWizard()).toBe(true);
  });

  it('does not render when a connection exists', () => {
    setup({
      connections: [{ id: 'c1', name: 'Conn', isActive: true }],
      activeConnectionId: 'c1',
      getJiraConnections: vi.fn(() => [{ id: 'c1' }]),
    });
    renderWithProviders(<SimpleModeWizard />);
    expect(screen.queryByText('Welcome to Jira ETL Dashboard')).not.toBeInTheDocument();
  });

  it('"Set up Jira connection" navigates to the settings tab', () => {
    setup();
    renderWithProviders(<SimpleModeWizard />);
    fireEvent.click(screen.getByText('Set up Jira connection'));
    expect((storeRef.current as WizardMockState).activeTab).toBe('settings');
    expect(localConfigMock.saveDemoMode).not.toHaveBeenCalled();
  });

  it('"Try demo data" enables demo mode and selects the demo connection', () => {
    setup();
    renderWithProviders(<SimpleModeWizard />);
    fireEvent.click(screen.getByText('Try demo data'));
    expect(localConfigMock.saveDemoMode).toHaveBeenCalledWith(true);
    const state = storeRef.current as WizardMockState;
    expect(state.activeConnectionId).toBe('demo');
    // 90-day window covering the demo dataset.
    expect(state.dateFrom).toBeTruthy();
    expect(state.dateTo).toBeTruthy();
  });

  it('"Skip for now" dismisses for the session only', () => {
    setup();
    renderWithProviders(<SimpleModeWizard />);
    fireEvent.click(screen.getByText(/skip for now/i));
    expect(sessionStorage.getItem('cfg_simple_wizard_dismissed')).toBe('1');
    expect(screen.queryByText('Welcome to Jira ETL Dashboard')).not.toBeInTheDocument();
    // Simulate the next session (fresh sessionStorage) — the wizard re-arms.
    sessionStorage.removeItem('cfg_simple_wizard_dismissed');
    expect(shouldShowSimpleModeWizard()).toBe(true);
  });
});
