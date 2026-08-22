import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
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
    getKpiPlugins: vi.fn(() => []),
    saveKpiPlugins: vi.fn(),
    saveActivePlugins: vi.fn(),
    getCollapsedGroups: vi.fn(() => []),
    saveCollapsedGroups: vi.fn(),
    getFavoritePlugins: vi.fn(() => []),
    saveFavoritePlugins: vi.fn(),
    getActiveConnectionId: vi.fn(() => ''),
    getStorageConfig: vi.fn(() => ({ provider: 'sqlite', url: '', isCustom: false })),
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
});
