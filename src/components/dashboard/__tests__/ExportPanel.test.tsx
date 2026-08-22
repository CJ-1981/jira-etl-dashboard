import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ExportPanel } from '../ExportPanel';
import { localConfig } from '@/lib/config/local-store';
import { createMockStore, renderWithProviders } from '@/test/mock-store';

const storeRef = vi.hoisted(() => ({ current: undefined as any }));

vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => {
    const s = storeRef.current;
    return typeof sel === 'function' ? sel(s) : s;
  },
}));

// ExportPanel imports localConfig + type PgConnection. Build inline.
vi.mock('@/lib/config/local-store', () => ({
  localConfig: { getPgConnections: vi.fn(() => []) },
  PgConnection: {},
}));

const fetchMock = vi.fn();

const EXTRACTION_RESULT = {
  issues: [
    {
      key: 'PROJ-1',
      fields: {
        summary: 'A ticket',
        status: { name: 'Done' },
        priority: { name: 'High' },
        issuetype: { name: 'Bug' },
        created: '2026-01-01',
        resolutiondate: '2026-01-02',
        assignee: { displayName: 'Alice' },
      },
    },
  ],
};

describe('ExportPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeRef.current = createMockStore();
    storeRef.current.extractionResult = null;
    storeRef.current.region = 'all';
    storeRef.current.dateFrom = '2026-01-01';
    storeRef.current.dateTo = '2026-01-31';
    (localConfig.getPgConnections as any).mockReturnValue([]);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/api/export/file')) {
        return { ok: true, blob: async () => new Blob(['kpi-data']) };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders File Export and Database Sync mode cards', () => {
    renderWithProviders(<ExportPanel />);
    expect(screen.getByText('File Export')).toBeInTheDocument();
    expect(screen.getByText('Database Sync')).toBeInTheDocument();
  });

  it('prompts to extract data first when there is no extraction result', () => {
    renderWithProviders(<ExportPanel />);
    expect(screen.getByText('Extract data first')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export JSON/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Export CSV/i })).toBeDisabled();
  });

  it('renders the data-type toggle (KPIs / Raw / Both)', () => {
    storeRef.current.extractionResult = EXTRACTION_RESULT;
    renderWithProviders(<ExportPanel />);
    expect(screen.getByRole('button', { name: 'KPIs' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raw' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Both' })).toBeInTheDocument();
  });

  it('enables export buttons and triggers /api/export/file for KPI export', async () => {
    storeRef.current.extractionResult = EXTRACTION_RESULT;
    renderWithProviders(<ExportPanel />);
    const jsonBtn = screen.getByRole('button', { name: /Export JSON/i });
    expect(jsonBtn).not.toBeDisabled();
    fireEvent.click(jsonBtn);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/export/file',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });

  it('exports raw issues directly (no fetch) when the Raw toggle is active', async () => {
    storeRef.current.extractionResult = EXTRACTION_RESULT;
    renderWithProviders(<ExportPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Raw' }));
    fireEvent.click(screen.getByRole('button', { name: /Export JSON/i }));
    // 'issues' path builds a blob locally and never hits the network.
    await waitFor(() => expect(screen.getByRole('button', { name: /Export JSON/i })).not.toBeDisabled());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
