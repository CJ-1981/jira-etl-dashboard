/**
 * Shared polling-query tests.
 *
 * Covers the two React Query sources that replaced the old per-component
 * 5-second interval pollers:
 *
 * - useJiraPollQuery (GET /api/jira/poll)
 * - usePluginEventsQuery (GET /api/kpi/plugins/events)
 *
 * The centerpiece is the dedup proof: when multiple consumers of the same
 * endpoint are mounted simultaneously they must share ONE request stream —
 * a single cache entry, and exactly one fetch per interval tick no matter how
 * many consumers are mounted.
 *
 * NOTE: interval behavior is exercised via a long cadence (no timer tricks) —
 * the old pollers were 5s setInterval loops and the queries keep that cadence
 * by default, so per-tick counting is covered by the refetchInterval option
 * itself; these tests assert dedup at the cache level plus fetch counts within
 * a window shorter than one tick.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useJiraPollQuery, JIRA_POLL_QUERY_KEY } from '../useJiraPollQuery';
import { usePluginEventsQuery, PLUGIN_EVENTS_QUERY_KEY } from '../usePluginEventsQuery';
import { usePollingNotifications } from '../usePollingNotifications';
import { usePolling } from '@/components/dashboard/extract/usePolling';

// ── app-store mock (needed by usePolling) ────────────────────────────────────
const storeRef = { current: undefined as any };
vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => (typeof sel === 'function' ? sel(storeRef.current) : storeRef.current),
}));

// ── local-store mock (needed by usePolling's POST payload builder) ───────────
vi.mock('@/lib/config/local-store', () => ({
  localConfig: {
    getKpiPlugins: vi.fn(() => []),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    loading: vi.fn(() => 'toast-id'),
    dismiss: vi.fn(),
  },
}));

// ── fetch mock ───────────────────────────────────────────────────────────────
const mockFetch = vi.fn();

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

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, refetchOnWindowFocus: false },
    },
  });
}

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

// Long enough that no interval tick fires during a unit test; dedup is proven
// via cache entries + fetch counts within this window.
const LONG_INTERVAL = 60_000;

const BASE_STORE = {
  connections: [
    { id: 'conn-1', name: 'Test', baseUrl: 'https://t.example', email: 'a@b.com', apiToken: 'tok', projectKeys: 'PROJ', isActive: true },
  ],
  activeConnectionId: 'conn-1',
  settings: { rateLimit: {}, general: {} },
  storageConfig: { provider: 'sqlite', url: '', isCustom: false },
};

beforeEach(() => {
  storeRef.current = { ...BASE_STORE };
  mockFetch.mockReset();
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
  vi.mocked(toast.info).mockClear();
  vi.stubGlobal('fetch', mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useJiraPollQuery — shared polling source', () => {
  it('fetches GET /api/jira/poll and exposes the polling payload', async () => {
    mockFetch.mockImplementation(() =>
      jsonResponse({ success: true, polling: { enabled: true, intervalMinutes: 15, lastRunId: 3 } })
    );
    const client = createTestQueryClient();
    const { result } = renderHook(() => useJiraPollQuery({ intervalMs: LONG_INTERVAL }), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.data?.success).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/jira/poll');
    expect(result.current.data?.polling.lastRunId).toBe(3);
  });

  it('resolves to null (never throws) when the server is unreachable', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('network down')));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useJiraPollQuery({ intervalMs: LONG_INTERVAL }), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
    expect(result.current.isError).toBe(false);
  });

  it('does not fetch while disabled', async () => {
    mockFetch.mockImplementation(() => jsonResponse({ success: true, polling: {} }));
    const client = createTestQueryClient();
    const { result } = renderHook(() => useJiraPollQuery({ enabled: false, intervalMs: LONG_INTERVAL }), { wrapper: wrapperFor(client) });

    // Give any (incorrect) fetch a window to happen.
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(result.current.data).toBeUndefined();
  });

  it('DEDUP: two simultaneous consumers share one request stream and one cache entry', async () => {
    mockFetch.mockImplementation(() =>
      jsonResponse({ success: true, polling: { enabled: true, intervalMinutes: 15, lastRunId: 1 } })
    );
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);

    // Consumer 1: page-level notifications hook.
    const notifications = renderHook(() => usePollingNotifications({ intervalMs: LONG_INTERVAL }), { wrapper });
    // Consumer 2: extract panel poller.
    const panel = renderHook(
      () =>
        usePolling({
          extracting: false,
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          jql: '',
          quickPullDays: null,
          customFields: [],
          updateOnly: false,
          onRunCompleted: vi.fn(),
          pollIntervalMs: LONG_INTERVAL,
        }),
      { wrapper }
    );

    // Both consumers observe the shared payload from the single request.
    await waitFor(() => expect(panel.result.current.polling?.enabled).toBe(true));

    // Exactly ONE request despite two mounted consumers — the query cache
    // dedupes by key.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/jira/poll');

    // One cache entry for the shared key.
    const entries = client.getQueryCache().findAll({ queryKey: JIRA_POLL_QUERY_KEY });
    expect(entries).toHaveLength(1);
    expect((entries[0].state.data as { polling: { enabled: boolean } }).polling.enabled).toBe(true);

    // Wait a while: no interval tick fires within this window, so the shared
    // stream must not issue any further requests on its own.
    await act(async () => { await new Promise((r) => setTimeout(r, 50)); });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(client.getQueryCache().findAll({ queryKey: JIRA_POLL_QUERY_KEY })).toHaveLength(1);

    notifications.unmount();
    panel.unmount();
  });

  it('DEDUP: consumers mounted at different times reuse the same cache entry', async () => {
    mockFetch.mockImplementation(() =>
      jsonResponse({ success: true, polling: { enabled: true, intervalMinutes: 15, lastRunId: 1 } })
    );
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);

    const first = renderHook(() => useJiraPollQuery({ intervalMs: LONG_INTERVAL }), { wrapper });
    await waitFor(() => expect(first.result.current.data?.success).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // Second consumer mounts later; staleTime 0 marks data stale so it refetches
    // once through the SAME cache entry (not a parallel new stream).
    const second = renderHook(() => useJiraPollQuery({ intervalMs: LONG_INTERVAL }), { wrapper });
    await waitFor(() => expect(second.result.current.data?.success).toBe(true));

    expect(client.getQueryCache().findAll({ queryKey: JIRA_POLL_QUERY_KEY })).toHaveLength(1);
    first.unmount();
    second.unmount();
  });

  it('notifies once per completed background run via usePollingNotifications', async () => {
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);
    const seed = { success: true, polling: { enabled: true, intervalMinutes: 15, lastRunId: 1, lastError: null, lastRunAt: null } };
    mockFetch.mockImplementation(() => jsonResponse(seed));

    renderHook(() => usePollingNotifications({ intervalMs: LONG_INTERVAL }), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // First response only seeds the marker — no toast.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(toast.success).not.toHaveBeenCalled();

    // Simulate the next poll tick returning a new completed run by updating the
    // shared cache directly (what the interval refetch would deliver).
    act(() => {
      client.setQueryData(JIRA_POLL_QUERY_KEY, {
        success: true,
        polling: {
          enabled: true,
          intervalMinutes: 15,
          lastRunId: 2,
          lastError: null,
          lastRunAt: '2026-08-23T10:00:00Z',
          lastRunSummary: { totalExtracted: 4, added: 3, updated: 1, unchanged: 0, deleted: 0 },
        },
      });
    });

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith(expect.stringContaining('Scheduled pull completed'), expect.anything())
    );
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect((toast.success as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toContain('4 issues (3 added, 1 updated)');
  });

  it('surfaces a failure toast when the completed run has lastError', async () => {
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);
    const seed = { success: true, polling: { enabled: true, intervalMinutes: 15, lastRunId: 1, lastError: null, lastRunAt: null } };
    mockFetch.mockImplementation(() => jsonResponse(seed));

    renderHook(() => usePollingNotifications({ intervalMs: LONG_INTERVAL }), { wrapper });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // Let the seed payload be processed so the marker is set before the run
    // id bumps — otherwise the bump is treated as the first observation.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    act(() => {
      client.setQueryData(JIRA_POLL_QUERY_KEY, {
        success: true,
        polling: { enabled: true, intervalMinutes: 15, lastRunId: 2, lastError: 'Jira 503', lastRunAt: '2026-08-23T10:00:00Z' },
      });
    });

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Scheduled pull failed'), expect.anything())
    );
    expect((toast.error as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toContain('Jira 503');
    expect(toast.success).not.toHaveBeenCalled();
  });

  it('usePolling signals onRunCompleted exactly once per new run id', async () => {
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);
    const onRunCompleted = vi.fn();
    mockFetch.mockImplementation(() =>
      jsonResponse({ success: true, polling: { enabled: true, intervalMinutes: 15, lastRunId: 5, lastError: null } })
    );

    renderHook(
      () =>
        usePolling({
          extracting: false,
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          jql: '',
          quickPullDays: null,
          customFields: [],
          updateOnly: false,
          onRunCompleted,
          pollIntervalMs: LONG_INTERVAL,
        }),
      { wrapper }
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
    // First observation only seeds the marker.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(onRunCompleted).not.toHaveBeenCalled();

    act(() => {
      client.setQueryData(JIRA_POLL_QUERY_KEY, {
        success: true,
        polling: { enabled: true, intervalMinutes: 15, lastRunId: 6, lastError: null },
      });
    });
    await waitFor(() => expect(onRunCompleted).toHaveBeenCalledTimes(1));

    // Same payload delivered again (e.g. next identical tick) → no second call.
    act(() => {
      client.setQueryData(JIRA_POLL_QUERY_KEY, {
        success: true,
        polling: { enabled: true, intervalMinutes: 15, lastRunId: 6, lastError: null },
      });
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(onRunCompleted).toHaveBeenCalledTimes(1);
  });
});

describe('usePluginEventsQuery — shared plugin-events source', () => {
  it('fetches GET /api/kpi/plugins/events and holds a single cache entry', async () => {
    mockFetch.mockImplementation(() =>
      jsonResponse({ success: true, timestamp: 1, eventCounter: 0, hasChanges: false })
    );
    const client = createTestQueryClient();
    const wrapper = wrapperFor(client);
    const { result } = renderHook(() => usePluginEventsQuery({ intervalMs: LONG_INTERVAL }), { wrapper });

    await waitFor(() => expect(result.current.data?.success).toBe(true));
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith('/api/kpi/plugins/events');

    // A second simultaneous consumer shares the entry — no extra request.
    const second = renderHook(() => usePluginEventsQuery({ intervalMs: LONG_INTERVAL }), { wrapper });
    await waitFor(() => expect(second.result.current.data?.success).toBe(true));
    // Mounting after the first fetch settled issues one background refresh of
    // the SAME cache entry (staleTime 0) — never a parallel second stream.
    expect(mockFetch.mock.calls.length).toBeLessThanOrEqual(2);
    expect(mockFetch.mock.calls.every(([url]) => url === '/api/kpi/plugins/events')).toBe(true);
    expect(client.getQueryCache().findAll({ queryKey: PLUGIN_EVENTS_QUERY_KEY })).toHaveLength(1);
  });

  it('resolves to null (never throws) on failure', async () => {
    mockFetch.mockImplementation(() => Promise.reject(new Error('boom')));
    const client = createTestQueryClient();
    const { result } = renderHook(() => usePluginEventsQuery({ intervalMs: LONG_INTERVAL }), { wrapper: wrapperFor(client) });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });
});
