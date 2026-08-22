import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { StoragePanel } from '../StoragePanel';
import { localConfig } from '@/lib/config/local-store';
import { createMockStore, renderWithProviders } from '@/test/mock-store';

// Holder created at hoist time (no import refs) so the vi.mock factory can read it.
// Populated fresh in beforeEach via createMockStore().
const storeRef = vi.hoisted(() => ({ current: undefined as any }));

vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => {
    const s = storeRef.current;
    return typeof sel === 'function' ? sel(s) : s;
  },
}));

// localConfig built inline (factory cannot reference imports); runtime helpers
// re-implemented to match the real module's behavior for the badge/URL logic.
vi.mock('@/lib/config/local-store', () => ({
  localConfig: {
    getJiraConnections: vi.fn(() => []),
    getPgConnections: vi.fn(() => []),
    savePgConnections: vi.fn(),
    saveStorageConfig: vi.fn(),
    getStorageConfig: vi.fn(() => ({ provider: 'sqlite', url: '', isCustom: false })),
  },
  PgConnection: {},
  buildPgConnectionUrl: (conn: any) =>
    `postgresql://${conn.username}@${conn.host}:${conn.port}/${conn.database}`,
  isSupabaseUrl: (url: string) => url.includes('supabase.com'),
  AppSettings: {},
}));

const DEFAULT_SETTINGS = {
  rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
  general: { defaultHolidayState: 'national', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
  persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
  sla: { statusTargets: {}, useAnyoneCommentsForSla: false },
  alerts: { thresholds: {} },
  webhooks: { enabled: false, url: '', secret: '' },
};

const fetchMock = vi.fn();

describe('StoragePanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeRef.current = createMockStore();
    storeRef.current.storageConfig = { provider: 'sqlite', url: '', isCustom: false };
    storeRef.current.settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    // Re-affirm localConfig defaults (clearAllMocks keeps impls but be explicit).
    (localConfig.getJiraConnections as any).mockReturnValue([]);
    (localConfig.getPgConnections as any).mockReturnValue([]);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/jira/extract/storage')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            storage: {
              totalExtractions: 2,
              totalTickets: 50,
              totalSizeMB: 1.5,
              oldestExtraction: '',
              newestExtraction: '',
              orphanedExtractions: 0,
              byConnection: [],
            },
          }),
        };
      }
      if (url.includes('/api/db/location')) {
        return { ok: true, json: async () => ({ success: true, path: 'C:\\data\\custom.db', hint: 'SQLite file' }) };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders SQLite and PostgreSQL storage cards with the provider badge', () => {
    renderWithProviders(<StoragePanel />);
    expect(screen.getByText('Local SQLite')).toBeInTheDocument();
    expect(screen.getByText('PostgreSQL / Supabase')).toBeInTheDocument();
    expect(screen.getByText('LOCAL SQLITE')).toBeInTheDocument();
  });

  it('shows the raw-URL input after selecting PostgreSQL', () => {
    const { rerender } = renderWithProviders(<StoragePanel />);
    fireEvent.click(screen.getByText('PostgreSQL / Supabase'));
    expect(storeRef.current.setStorageConfig).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'postgresql' }),
    );
    // Mock store is not reactive on its own, so re-render to read the mutation.
    rerender(<StoragePanel />);
    expect(screen.getByText('Custom Connection String')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('postgres://user:pass@host:port/db')).toBeInTheDocument();
    expect(screen.getByText('POSTGRESQL')).toBeInTheDocument();
  });

  it('toggles the auto-save persistence switch', () => {
    renderWithProviders(<StoragePanel />);
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[0]); // Auto-save after extraction
    expect(storeRef.current.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        persistence: expect.objectContaining({ autoSave: false }),
      }),
    );
  });

  it('toggles the auto-restore persistence switch', () => {
    renderWithProviders(<StoragePanel />);
    const switches = screen.getAllByRole('switch');
    fireEvent.click(switches[1]); // Auto-restore on page load
    expect(storeRef.current.setSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        persistence: expect.objectContaining({ autoRestore: false }),
      }),
    );
  });

  it('loads storage info and db location from the API on mount', async () => {
    renderWithProviders(<StoragePanel />);
    await waitFor(() => expect(screen.getByText(/2 extractions/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith('/api/jira/extract/storage', expect.anything());
    expect(fetchMock).toHaveBeenCalledWith('/api/db/location');
    // Use exact strings so the matcher does not also catch ancestor <p>/<div>.
    expect(screen.getByText('Database file:')).toBeInTheDocument();
    expect(screen.getByText('C:\\data\\custom.db')).toBeInTheDocument();
  });
});
