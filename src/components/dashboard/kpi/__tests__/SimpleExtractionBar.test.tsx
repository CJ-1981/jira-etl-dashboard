import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { SimpleExtractionBar } from '../SimpleExtractionBar';
import { QueryClient } from '@tanstack/react-query';
import { createMockStore, renderWithProviders } from '@/test/mock-store';

// ── fetch mock (extraction + master refresh + poll ping) ─────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

function jsonResponse(payload: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  });
}

const CONNECTIONS = [
  { id: 'conn-1', name: 'Test Connection', baseUrl: 'https://test.example', email: 'a@b.com', apiToken: 'tok', projectKeys: 'PROJ', isActive: true },
];

// ── Store ref (vi.hoisted avoids the vitest-4 import-TDZ issue) ──────────────
const storeRef = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));
vi.mock('@/store/app-store', () => {
  const useAppStore = (sel?: unknown) =>
    typeof sel === 'function' ? (sel as (s: unknown) => unknown)(storeRef.current) : storeRef.current;
  useAppStore.getState = () => storeRef.current;
  return { useAppStore, getState: () => storeRef.current };
});

let localConfigMock: Record<string, unknown>;
vi.mock('@/lib/config/local-store', () => ({
  get localConfig() {
    return localConfigMock;
  },
}));

function setupLocalConfig(overrides: Record<string, unknown> = {}) {
  localConfigMock = {
    getDemoMode: vi.fn(() => false),
    getQuickPullDays: vi.fn(() => 90),
    saveQuickPullDays: vi.fn(),
    getCustomExtractFields: vi.fn(() => []),
    ...overrides,
  };
}

describe('SimpleExtractionBar', () => {
  beforeEach(() => {
    setupLocalConfig();
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: unknown) => {
      const u = String(url);
      if (u.includes('/api/jira/poll')) return jsonResponse({ success: false });
      return jsonResponse({ success: true });
    });
  });

  it('invalidates the KPI results query after a pull so plugins recalculate', async () => {
    const invalidate = vi.fn().mockResolvedValue(undefined);
    const queryClient = new QueryClient();
    queryClient.invalidateQueries = invalidate;
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      connections: CONNECTIONS,
      dateFrom: '2026-07-23',
      dateTo: '2026-10-20',
    });
    renderWithProviders(<SimpleExtractionBar />, queryClient);

    fireEvent.click(screen.getByRole('button', { name: /run extraction/i }));
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['kpi-results'] }));
  });

  it('runs the extraction with the bar\u0027s own pull window, not the analysis period', async () => {
    // The analysis period (store dateFrom/dateTo) differs from the bar's local
    // pull window (quickPullDays = 90 → ~today-90d .. today).
    storeRef.current = createMockStore({
      activeConnectionId: 'conn-1',
      connections: CONNECTIONS,
      dateFrom: '2026-07-23',
      dateTo: '2026-10-20',
    });
    renderWithProviders(<SimpleExtractionBar />);

    const runBtn = screen.getByRole('button', { name: /run extraction/i });
    expect(runBtn).toBeEnabled();
    fireEvent.click(runBtn);

    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('/api/jira/extract', expect.objectContaining({ method: 'POST' })));
    const extractCall = mockFetch.mock.calls.find((c: unknown[]) => String(c[0]).includes('/api/jira/extract'));
    const body = JSON.parse((extractCall as unknown as [string, RequestInit])[1].body as string);

    // The pull window comes from the bar (quickPullDays=90), NOT from the
    // store's analysis period (2026-07-23).
    const expectedFrom = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    expect(body.dateFrom).toBe(expectedFrom);
    expect(body.dateFrom).not.toBe('2026-07-23');
  });

  it('renders the connection name and disables Run without a connection', () => {
    storeRef.current = createMockStore({ activeConnectionId: '', connections: [] });
    renderWithProviders(<SimpleExtractionBar />);
    expect(screen.getByText('No connection')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run extraction/i })).toBeDisabled();
  });
});
