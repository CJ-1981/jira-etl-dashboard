import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PluginsPanel } from '../PluginsPanel';
import { localConfig, DEFAULT_SETTINGS } from '@/lib/config/local-store';
import { createMockStore, renderWithProviders } from '@/test/mock-store';

const storeRef = vi.hoisted(() => ({ current: undefined as any }));

vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => {
    const s = storeRef.current;
    return typeof sel === 'function' ? sel(s) : s;
  },
}));

// PluginsPanel imports localConfig, KEYS, DEFAULT_SETTINGS, + type KpiPlugin/AppSettings.
// The factory cannot reference top-level vars, so DEFAULT_SETTINGS is inlined here.
vi.mock('@/lib/config/local-store', () => ({
  localConfig: {
    getDemoMode: vi.fn(() => false),
    saveDemoMode: vi.fn(),
    getKpiPlugins: vi.fn(() => []),
    saveKpiPlugins: vi.fn(),
    saveActivePlugins: vi.fn(),
    getCollapsedGroups: vi.fn(() => []),
    saveCollapsedGroups: vi.fn(),
    getFavoritePlugins: vi.fn(() => []),
    saveFavoritePlugins: vi.fn(),
    getActiveConnectionId: vi.fn(() => ''),
    getStorageConfig: vi.fn(() => ({ provider: 'sqlite', url: '', isCustom: false })),
    // Baseline for the Save buttons — same source the store is seeded from.
    getSettings: vi.fn(() => JSON.parse(JSON.stringify(DEFAULT_SETTINGS))),
    saveSettings: vi.fn(),
  },
  KEYS: {
    activePlugins: 'cfg_active_plugins',
    favoritePlugins: 'cfg_favorite_plugins',
    collapsedGroups: 'cfg_collapsed_plugin_groups',
    widgetOrder: 'widget_display_order',
  },
  KpiPlugin: {},
  AppSettings: {},
  DEFAULT_SETTINGS: {
    rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
    general: { defaultHolidayState: 'all', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
    persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
    sla: { statusTargets: {}, useAnyoneCommentsForSla: false },
    alerts: { thresholds: {} },
    webhooks: { enabled: false, url: '', secret: '' },
  },
}));

const BUILTIN_PLUGINS = [
  { id: 'ticket-count', name: 'Ticket Count', description: 'Total tickets extracted', unit: 'tickets', domain: 'throughput', pluginType: 'builtin', category: 'throughput' },
  { id: 'avg-cycle-time', name: 'Cycle Time', description: 'Average cycle time', unit: 'hours', domain: 'turnaround', pluginType: 'builtin', category: 'turnaround' },
];

const fetchMock = vi.fn();

describe('PluginsPanel', () => {
  // jsdom lacks the pointer-capture APIs Radix Select's option rows call on click.
  beforeAll(() => {
    const proto = HTMLElement.prototype as unknown as Record<
      'hasPointerCapture' | 'setPointerCapture' | 'releasePointerCapture',
      () => void
    >;
    proto.hasPointerCapture = () => false;
    proto.setPointerCapture = () => {};
    proto.releasePointerCapture = () => {};
  });

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    storeRef.current = createMockStore();
    storeRef.current.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    storeRef.current.settings.general.defaultHolidayState = 'all';
    (localConfig.getKpiPlugins as any).mockReturnValue([]);
    (localConfig.getCollapsedGroups as any).mockReturnValue([]);
    (localConfig.getFavoritePlugins as any).mockReturnValue([]);
    (localConfig.getActiveConnectionId as any).mockReturnValue('');
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/kpi/plugins/events')) {
        return { ok: true, json: async () => ({ success: true, hasChanges: false }) };
      }
      if (url.includes('/api/kpi/plugins')) {
        return { ok: true, json: async () => ({ success: true, plugins: BUILTIN_PLUGINS }) };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Helper: wait until the builtin plugins have loaded into the registry.
  const waitForPlugins = () =>
    waitFor(() => expect(screen.getAllByText('Ticket Count').length).toBeGreaterThan(0));

  it('renders the plugin registry from /api/kpi/plugins', async () => {
    renderWithProviders(<PluginsPanel />);
    expect(await screen.findByText('KPI Plugin Registry')).toBeInTheDocument();
    await waitForPlugins();
    expect(screen.getAllByText('Ticket Count').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cycle Time').length).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenCalledWith('/api/kpi/plugins');
  });

  it('filters plugins by search query', async () => {
    renderWithProviders(<PluginsPanel />);
    await waitForPlugins();
    const search = screen.getByPlaceholderText('Search plugins by name, description, or category...');
    fireEvent.change(search, { target: { value: 'zzznomatch' } });
    await waitFor(() => expect(screen.getByText(/No plugins found matching/)).toBeInTheDocument());
  });

  it('toggles a plugin checkbox and persists to localConfig', async () => {
    renderWithProviders(<PluginsPanel />);
    await waitForPlugins();
    // Registry checkbox id is `plugin-${plugin.id}`.
    const checkbox = document.getElementById('plugin-ticket-count')!;
    fireEvent.click(checkbox);
    expect(localConfig.saveActivePlugins).toHaveBeenCalled();
  });

  it('deselects all plugins via the None button', async () => {
    renderWithProviders(<PluginsPanel />);
    await waitForPlugins();
    fireEvent.click(screen.getByRole('button', { name: 'None' }));
    expect(localConfig.saveActivePlugins).toHaveBeenCalledWith([]);
  });

  it('selects all plugins via the All button', async () => {
    renderWithProviders(<PluginsPanel />);
    await waitForPlugins();
    // Two buttons are labelled "All"; the first in DOM is the select-all action.
    const allButtons = screen.getAllByRole('button', { name: 'All' });
    fireEvent.click(allButtons[0]);
    expect(localConfig.saveActivePlugins).toHaveBeenCalledWith(
      expect.arrayContaining(['ticket-count', 'avg-cycle-time']),
    );
  });

  // Regression: the old baseline (store snapshot + hydration heuristic that
  // re-armed while settings equalled the defaults) swallowed the first edit,
  // so picking only a German state left "Save KPI Defaults" disabled until a
  // second field also changed.
  it('enables Save KPI Defaults after changing only the German state', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { rerender } = renderWithProviders(<PluginsPanel />, queryClient);
    await waitForPlugins();
    // Mock store is in simple mode — the settings cards start collapsed.
    fireEvent.click(screen.getByText('KPI Calculation Defaults'));

    const stateSelect = screen.getByRole('combobox');
    fireEvent.pointerDown(stateSelect, { button: 0, ctrlKey: false });
    fireEvent.click(stateSelect);
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Bayern'));

    // The mock store mutates in place without notifying subscribers, so nudge
    // a re-render for the dirty-check to run with the updated settings.
    rerender(<QueryClientProvider client={queryClient}><PluginsPanel /></QueryClientProvider>);
    expect(screen.getByRole('button', { name: /Save KPI Defaults/i })).toBeEnabled();
  });
});
