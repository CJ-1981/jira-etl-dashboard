import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient } from '@tanstack/react-query';
import { ExtractPanel } from '../ExtractPanel';
import { createMockStore, createMockLocalConfig, renderWithProviders } from '@/test/mock-store';
import { masterDatasetQueryKey } from '@/hooks/useMasterDatasetQuery';

// ── Store ref (vi.hoisted ref avoids the vitest-4 import-TDZ issue) ──────────
const storeRef = vi.hoisted(() => ({ current: undefined as any }));
vi.mock('@/store/app-store', () => {
  // Real zustand exposes getState() on the hook itself — mirror that here so
  // hooks reading `useAppStore.getState()` see the mock state too.
  const useAppStore: any = (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current);
  useAppStore.getState = () => storeRef.current;
  return { useAppStore, getState: () => storeRef.current };
});

// localConfig is read lazily (getter) so createMockLocalConfig() can run after imports init.
let localConfigMock: any;
vi.mock('@/lib/config/local-store', () => ({
  get localConfig() {
    return localConfigMock;
  },
}));

vi.mock('@/lib/jira/field-config', () => ({
  DEFAULT_FIELD_CONFIG: { storyPointsField: 'customfield_10002', issueOwnerTeamField: 'customfield_10132' },
}));

// ── fetch mock ───────────────────────────────────────────────────────────────
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

const DEFAULT_SETTINGS = {
  rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' },
  general: { defaultHolidayState: 'national', workStartHour: 9, workEndHour: 17, defaultSlaTargetHours: 40, listMaxHeight: 400 },
  persistence: { autoSave: true, autoRestore: true, retentionDays: 30 },
  sla: { statusTargets: {}, useAnyoneCommentsForSla: false },
  alerts: { thresholds: {} },
  webhooks: { enabled: false, url: '', secret: '' },
};

const CONNECTIONS = [
  {
    id: 'conn-1',
    name: 'Test Connection',
    baseUrl: 'https://test.example',
    email: 'a@b.com',
    apiToken: 'tok',
    projectKeys: 'PROJ',
    isActive: true,
  },
];

function setupLocalConfig(overrides: Record<string, unknown> = {}) {
  localConfigMock = createMockLocalConfig({
    getSavedJqls: vi.fn(() => []),
    saveJqls: vi.fn(),
    getCustomExtractFields: vi.fn(() => []),
    saveCustomExtractFields: vi.fn(),
    getSettings: vi.fn(() => JSON.parse(JSON.stringify(DEFAULT_SETTINGS))),
    getKpiPlugins: vi.fn(() => []),
    getEtlUpdateOnly: vi.fn(() => false),
    getExtractJql: vi.fn(() => ''),
    getExtractDates: vi.fn(() => ({ dateFrom: '', dateTo: '' })),
    getQuickPullDays: vi.fn(() => null),
    saveExtractDates: vi.fn(),
    saveExtractJql: vi.fn(),
    saveEtlUpdateOnly: vi.fn(),
    saveQuickPullDays: vi.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  setupLocalConfig();
  mockFetch.mockReset();
  // Default: poll endpoint returns success:false so its effect does not call
  // setState (avoids act warnings in synchronous tests); everything else generic.
  mockFetch.mockImplementation((url: any) => {
    const u = String(url);
    if (u.includes('/api/jira/poll')) {
      return jsonResponse({ success: false });
    }
    return jsonResponse({ success: true });
  });
});

describe('ExtractPanel', () => {
  it('renders with no active connection and shows "No connection selected"', async () => {
    storeRef.current = createMockStore({ activeConnectionId: '', connections: [] });
    renderWithProviders(<ExtractPanel />);

    expect(await screen.findByText(/No connection selected/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run jira extraction/i })).toBeDisabled();
  });

  it('renders with an active connection showing the connection name', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS });
    renderWithProviders(<ExtractPanel />);

    expect(await screen.findByText('Test Connection')).toBeInTheDocument();
    expect(screen.queryByText(/No connection selected/i)).not.toBeInTheDocument();
  });

  it('fills the JQL textarea and reflects the typed value', () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS });
    renderWithProviders(<ExtractPanel />);

    const jql = screen.getByPlaceholderText(/project = "PROJ"/);
    fireEvent.change(jql, { target: { value: 'project = TEST' } });
    expect(jql).toHaveValue('project = TEST');
  });

  it('toggles Update Only Mode on', () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS });
    renderWithProviders(<ExtractPanel />);

    const sw = screen.getByLabelText(/update only mode/i);
    expect(sw).toHaveAttribute('data-state', 'unchecked');
    fireEvent.click(sw);
    expect(sw).toHaveAttribute('data-state', 'checked');
  });

  it('Run button is disabled without dates even with a connection', () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS, dateFrom: '', dateTo: '' });
    renderWithProviders(<ExtractPanel />);

    expect(screen.getByRole('button', { name: /run jira extraction/i })).toBeDisabled();
  });

  it('Run button is enabled when connection + dates are present', () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      connections: CONNECTIONS,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    renderWithProviders(<ExtractPanel />);

    expect(screen.getByRole('button', { name: /run jira extraction/i })).toBeEnabled();
  });

  it('runs an extraction and renders the results card with extracted issues', async () => {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      connections: CONNECTIONS,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    });
    const masterAfterRun = {
      totalExtracted: 2,
      dateRange: { from: '2026-01-01', to: '2026-01-31' },
      lastUpdated: '2026-01-31T12:00:00Z',
      // After a saved run the preview loads the accumulated dataset,
      // so the master payload carries the stored tickets.
      issues: [
        { key: 'PROJ-1', fields: { summary: 'Bug one', status: { name: 'Done' }, assignee: { displayName: 'Alice' }, created: '2026-01-01' } },
        { key: 'PROJ-2', fields: { summary: 'Task two', status: { name: 'Open' }, created: '2026-01-02' } },
      ],
    };
    mockFetch.mockImplementation((url: any) => {
      const u = String(url);
      if (u.includes('/api/jira/poll')) {
        return jsonResponse({ success: true, polling: { enabled: false, intervalMinutes: 15 } });
      }
      if (u.includes('/api/jira/extract')) {
        return jsonResponse({
          success: true,
          summary: { totalExtracted: 2, added: 1, updated: 1, unchanged: 0, deleted: 0 },
          etlRunId: 42,
          issues: [
            { key: 'PROJ-1', fields: { summary: 'Bug one', status: { name: 'Done' }, assignee: { displayName: 'Alice' }, created: '2026-01-01' }, statusCategory: 'done' },
            { key: 'PROJ-2', fields: { summary: 'Task two', status: { name: 'Open' }, created: '2026-01-02' } },
          ],
        });
      }
      if (u.includes('/api/jira/master/')) {
        return jsonResponse({ success: true, data: masterAfterRun });
      }
      return jsonResponse({ success: true });
    });

    // Seed the master-dataset cache the way the app's page-level query would
    // have left it before the run.
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    queryClient.setQueryData(
      masterDatasetQueryKey('conn-1', storeRef.current.storageConfig),
      masterAfterRun
    );
    renderWithProviders(<ExtractPanel />, queryClient);
    const runBtn = screen.getByRole('button', { name: /run jira extraction/i });
    fireEvent.click(runBtn);

    // The saved run swaps the preview to the full master dataset, so the
    // card shows the accumulated totals rather than this run's subset.
    expect(await screen.findByText(/Master Dataset/i)).toBeInTheDocument();
    expect(screen.getByText('PROJ-1')).toBeInTheDocument();
    expect(mockFetch).toHaveBeenCalledWith('/api/jira/extract', expect.objectContaining({ method: 'POST' }));
  });

  it('saves a JQL query through the save flow and persists via localConfig', async () => {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS });
    renderWithProviders(<ExtractPanel />);

    const jql = screen.getByPlaceholderText(/project = "PROJ"/);
    fireEvent.change(jql, { target: { value: 'project = TEST' } });

    fireEvent.click(screen.getByRole('button', { name: /save query/i }));
    const nameInput = await screen.findByPlaceholderText(/query name/i);
    fireEvent.change(nameInput, { target: { value: 'My Query' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm save/i }));

    await waitFor(() =>
      expect(localConfigMock.saveJqls).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ name: 'My Query', query: 'project = TEST' })])
      )
    );
  });
});
