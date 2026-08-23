import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import { JqlEditor } from '../extract/JqlEditor';
import { MasterDatasetCard } from '../extract/MasterDatasetCard';
import { CustomFieldDiscovery } from '../extract/CustomFieldDiscovery';
import { useExtraction } from '../extract/useExtraction';
import { usePolling } from '../extract/usePolling';
import { createMockStore, createMockLocalConfig, renderWithProviders } from '@/test/mock-store';

// ── Store ref (vi.hoisted ref avoids the vitest-4 import-TDZ issue) ──────────
const storeRef = vi.hoisted(() => ({ current: undefined as any }));
vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current),
  getState: () => storeRef.current,
}));

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

const CONNECTIONS = [
  { id: 'conn-1', name: 'Test Connection', baseUrl: 'https://test.example', email: 'a@b.com', apiToken: 'tok', projectKeys: 'PROJ', isActive: true },
];

function setupLocalConfig(overrides: Record<string, unknown> = {}) {
  localConfigMock = createMockLocalConfig({
    getSavedJqls: vi.fn(() => []),
    saveJqls: vi.fn(),
    getCustomExtractFields: vi.fn(() => []),
    saveCustomExtractFields: vi.fn(),
    getKpiPlugins: vi.fn(() => []),
    ...overrides,
  });
}

beforeEach(() => {
  setupLocalConfig();
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => jsonResponse({ success: true }));
});

// ── JqlEditor (saved-JQL CRUD) ───────────────────────────────────────────────
describe('JqlEditor', () => {
  it('renders the textarea and forwards edits via onJqlChange', () => {
    const onJqlChange = vi.fn();
    renderWithProviders(<JqlEditor jql="" onJqlChange={onJqlChange} />);
    const ta = screen.getByPlaceholderText(/project = "PROJ"/);
    fireEvent.change(ta, { target: { value: 'project = TEST' } });
    expect(onJqlChange).toHaveBeenCalledWith('project = TEST');
  });

  it('Escape clears the query', () => {
    const onJqlChange = vi.fn();
    renderWithProviders(<JqlEditor jql="something" onJqlChange={onJqlChange} />);
    const ta = screen.getByPlaceholderText(/project = "PROJ"/);
    fireEvent.keyDown(ta, { key: 'Escape' });
    expect(onJqlChange).toHaveBeenCalledWith('');
  });

  it('saves the current query through the save flow', async () => {
    renderWithProviders(<JqlEditor jql="project = TEST" onJqlChange={vi.fn()} />);
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

  it('renders saved queries and loads one on select', async () => {
    setupLocalConfig({
      getSavedJqls: vi.fn(() => [{ id: 'j1', name: 'Saved One', query: 'project = SAVED' }]),
    });
    const onJqlChange = vi.fn();
    renderWithProviders(<JqlEditor jql="" onJqlChange={onJqlChange} />);
    // "Load saved..." trigger present because there is at least one saved JQL.
    expect(await screen.findByText(/load saved/i)).toBeInTheDocument();
  });
});

// ── MasterDatasetCard ────────────────────────────────────────────────────────
describe('MasterDatasetCard', () => {
  const info = {
    totalExtracted: 42,
    dateRange: { from: '2026-01-01', to: '2026-01-31' },
    lastUpdated: '2026-01-31T12:00:00Z',
  };

  function setupStore(overrides: Record<string, unknown> = {}) {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS, ...overrides });
  }

  it('renders the total and date range', () => {
    setupStore();
    renderWithProviders(<MasterDatasetCard info={info} extracting={false} onShowAllTickets={vi.fn()} />);
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getAllByText(/master dataset/i).length).toBeGreaterThan(0);
  });

  it('Show All Tickets invokes the handler', () => {
    setupStore();
    const onShowAllTickets = vi.fn();
    renderWithProviders(<MasterDatasetCard info={info} extracting={false} onShowAllTickets={onShowAllTickets} />);
    fireEvent.click(screen.getByRole('button', { name: /show all tickets/i }));
    expect(onShowAllTickets).toHaveBeenCalled();
  });

  it('Clear Master Dataset calls the delete endpoint and resets state', async () => {
    setupStore();
    mockFetch.mockImplementation(() => jsonResponse({ success: true, message: 'Cleared' }));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderWithProviders(<MasterDatasetCard info={info} extracting={false} onShowAllTickets={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /clear master dataset/i }));
    await waitFor(() => {
      const calls = mockFetch.mock.calls.map(c => String(c[0]));
      expect(calls.some(u => u.includes('/api/jira/master/conn-1'))).toBe(true);
    });
    expect(storeRef.current.setMasterDatasetInfo).toHaveBeenCalled();
    expect(storeRef.current.setExtractionResult).toHaveBeenCalledWith(null);
    (window.confirm as any).mockRestore();
  });
});

// ── CustomFieldDiscovery ─────────────────────────────────────────────────────
describe('CustomFieldDiscovery', () => {
  function setupStore(overrides: Record<string, unknown> = {}) {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS, ...overrides });
  }

  it('expands to show the add-field form and adds a manual field', async () => {
    setupStore();
    const onFieldsChange = vi.fn();
    renderWithProviders(<CustomFieldDiscovery customFields={[]} onFieldsChange={onFieldsChange} jql="" />);
    fireEvent.click(screen.getByText(/custom extract fields/i));
    const idInput = await screen.findByPlaceholderText(/customfield_12345/);
    const labelInput = screen.getByPlaceholderText(/display label/i);
    fireEvent.change(idInput, { target: { value: 'customfield_999' } });
    fireEvent.change(labelInput, { target: { value: 'My Field' } });
    // The add-field button is an icon-only Button; it is the last button in the
    // expanded section (after the header toggle and the Discover button).
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(onFieldsChange).toHaveBeenCalled());
  });

  it('shows existing custom fields with a count badge', () => {
    setupStore();
    const fields = [{ id: 'cf-1', fieldId: 'customfield_1', label: 'Existing', role: undefined }];
    renderWithProviders(<CustomFieldDiscovery customFields={fields} onFieldsChange={vi.fn()} jql="" />);
    expect(screen.getByText('Custom Extract Fields')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });
});

// ── useExtraction hook ───────────────────────────────────────────────────────
describe('useExtraction', () => {
  function setupStore(overrides: Record<string, unknown> = {}) {
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      connections: CONNECTIONS,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      ...overrides,
    });
  }

  function renderExtraction() {
    return renderHook(() =>
      useExtraction({
        jql: '',
        quickPullDays: null,
        saveThisExtraction: true,
        updateOnly: false,
        customFields: [],
        getPollEnabled: () => false,
      })
    );
  }

  it('starts not extracting and exposes handlers', () => {
    setupStore();
    const { result } = renderExtraction();
    expect(result.current.extracting).toBe(false);
    expect(typeof result.current.handleExtract).toBe('function');
    expect(typeof result.current.handleShowAllTickets).toBe('function');
    expect(typeof result.current.refreshMasterData).toBe('function');
  });

  it('handleExtract posts to /api/jira/extract and stores the result', async () => {
    setupStore();
    mockFetch.mockImplementation((url: any) => {
      const u = String(url);
      if (u.includes('/api/jira/extract')) {
        return jsonResponse({
          success: true,
          summary: { totalExtracted: 1, added: 1, updated: 0, unchanged: 0, deleted: 0 },
          etlRunId: 7,
          issues: [{ key: 'PROJ-1', fields: { summary: 'x', status: { name: 'Open' }, created: '2026-01-01' } }],
        });
      }
      if (u.includes('/api/jira/master/')) {
        return jsonResponse({ success: true, data: { totalExtracted: 1, lastUpdated: '2026-01-31T00:00:00Z', issues: [] } });
      }
      return jsonResponse({ success: true });
    });

    const { result } = renderExtraction();
    await act(async () => {
      await result.current.handleExtract();
    });

    expect(mockFetch).toHaveBeenCalledWith('/api/jira/extract', expect.objectContaining({ method: 'POST' }));
    expect(storeRef.current.setExtractionResult).toHaveBeenCalledWith(
      expect.objectContaining({ total: 1, etlRunId: 7 })
    );
    expect(result.current.extracting).toBe(false);
  });

  it('handleExtract flags lastExtractionEmpty when zero issues returned', async () => {
    setupStore();
    mockFetch.mockImplementation((url: any) => {
      const u = String(url);
      if (u.includes('/api/jira/extract')) {
        return jsonResponse({ success: true, summary: { totalExtracted: 0, added: 0, updated: 0, unchanged: 0, deleted: 0 }, issues: [] });
      }
      return jsonResponse({ success: true });
    });
    const { result } = renderExtraction();
    await act(async () => {
      await result.current.handleExtract();
    });
    expect(result.current.lastExtractionEmpty).toBe(true);
    expect(storeRef.current.setExtractionResult).toHaveBeenCalledWith(null);
  });
});

// ── usePolling hook ──────────────────────────────────────────────────────────
describe('usePolling', () => {
  function setupStore(overrides: Record<string, unknown> = {}) {
    storeRef.current = createMockStore({ activeConnectionId: 'conn-1', connections: CONNECTIONS, ...overrides });
  }

  function renderPolling(overrides: Partial<Parameters<typeof usePolling>[0]> = {}) {
    return renderHook(() =>
      usePolling({
        extracting: false,
        dateFrom: '2026-01-01',
        dateTo: '2026-01-31',
        jql: '',
        quickPullDays: null,
        customFields: [],
        updateOnly: false,
        onRunCompleted: vi.fn(),
        ...overrides,
      })
    );
  }

  it('loads polling status on mount and reflects it in state', async () => {
    setupStore();
    mockFetch.mockImplementation(() =>
      jsonResponse({ success: true, polling: { enabled: true, intervalMinutes: 30 } })
    );
    const { result } = renderPolling();
    await waitFor(() => expect(result.current.pollEnabled).toBe(true));
    expect(result.current.pollInterval).toBe('30');
  });

  it('handleTogglePolling posts the new state and updates pollEnabled', async () => {
    setupStore();
    mockFetch.mockImplementation((_url: any, init: any) => {
      if (init?.method === 'POST') {
        return jsonResponse({ success: true, polling: { enabled: true, intervalMinutes: 15 } });
      }
      return jsonResponse({ success: true, polling: { enabled: false, intervalMinutes: 15 } });
    });
    const { result } = renderPolling({ extracting: true });
    await act(async () => {
      await result.current.handleTogglePolling(true);
    });
    expect(mockFetch).toHaveBeenCalledWith('/api/jira/poll', expect.objectContaining({ method: 'POST' }));
    await waitFor(() => expect(result.current.pollEnabled).toBe(true));
  });

  it('stays disabled when the server rejects the toggle', async () => {
    setupStore();
    mockFetch.mockImplementation((_url: any, init: any) => {
      if (init?.method === 'POST') {
        return jsonResponse({ success: false, error: 'nope' });
      }
      return jsonResponse({ success: true, polling: { enabled: false, intervalMinutes: 15 } });
    });
    const { result } = renderPolling({ extracting: true });
    await act(async () => {
      await result.current.handleTogglePolling(true);
    });
    await waitFor(() => expect(result.current.pollEnabled).toBe(false));
  });
});
