import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import { ConnectionsPanel } from '../ConnectionsPanel';
import { localConfig } from '@/lib/config/local-store';
import { createMockStore, renderWithProviders } from '@/test/mock-store';

const storeRef = vi.hoisted(() => ({ current: undefined as any }));

vi.mock('@/store/app-store', () => ({
  useAppStore: (sel: any) => {
    const s = storeRef.current;
    return typeof sel === 'function' ? sel(s) : s;
  },
}));

// ConnectionsPanel imports `localConfig` + `JiraConnection`. Build inline; the
// factory cannot reference imports.
vi.mock('@/lib/config/local-store', () => ({
  localConfig: {
    getJiraConnections: vi.fn(() => []),
    saveJiraConnections: vi.fn(),
  },
  JiraConnection: {},
}));

const fetchMock = vi.fn();

const SEED_CONN = {
  id: 'c1',
  name: 'Cloud Jira',
  baseUrl: 'https://test.atlassian.net',
  apiToken: 'tok-123',
  email: 'a@b.com',
  projectKeys: 'PROJ',
  isActive: true,
};

describe('ConnectionsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storeRef.current = createMockStore();
    storeRef.current.connections = [];
    storeRef.current.activeConnectionId = '';
    (localConfig.getJiraConnections as any).mockReturnValue([]);
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string, opts: any) => {
      if (url.includes('/api/jira/test')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            serverInfo: { serverTitle: 'My Jira Server', deploymentType: 'Cloud', version: '1001.0' },
            diagnostics: { responseTime: '42ms' },
          }),
        };
      }
      if (url.includes('/api/jira/connections/')) {
        return { ok: true, json: async () => ({ success: true }) };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows the empty state when no connections are configured', () => {
    renderWithProviders(<ConnectionsPanel />);
    expect(screen.getByText('No Jira connections configured yet')).toBeInTheDocument();
  });

  it('fills the form, saves, and shows the new connection row with Test/Edit/Remove', async () => {
    renderWithProviders(<ConnectionsPanel />);
    fireEvent.change(screen.getByPlaceholderText('e.g. Company Jira Cloud'), { target: { value: 'My Jira' } });
    fireEvent.change(screen.getByPlaceholderText('https://your-domain.atlassian.net'), { target: { value: 'https://my.atlassian.net' } });
    fireEvent.change(screen.getByPlaceholderText('user@company.com'), { target: { value: 'me@company.com' } });
    fireEvent.change(screen.getByPlaceholderText('Your Jira API token'), { target: { value: 'secret-token' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. PROJ, DEV, OPS'), { target: { value: 'PROJ' } });

    fireEvent.click(screen.getByRole('button', { name: /Save Jira Connection/i }));

    // setConnections mutates the store; the local setForm/setEditingId calls
    // trigger a re-render that reads the mutated store.
    expect(await screen.findByText('My Jira')).toBeInTheDocument();
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('Remove')).toBeInTheDocument();
    expect(localConfig.saveJiraConnections).toHaveBeenCalled();
    expect(screen.getByText('Active Connection')).toBeInTheDocument();
  });

  it('pre-fills the form when Edit is clicked', () => {
    storeRef.current.connections = [SEED_CONN];
    renderWithProviders(<ConnectionsPanel />);
    fireEvent.click(screen.getByText('Edit'));
    // The name input is now populated with the connection name.
    expect(screen.getByDisplayValue('Cloud Jira')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Update Connection/i })).toBeInTheDocument();
  });

  it('opens a confirm dialog and deletes the connection via DELETE request', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    storeRef.current.connections = [SEED_CONN];
    renderWithProviders(<ConnectionsPanel />);
    fireEvent.click(screen.getByText('Remove'));
    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('Cloud Jira'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jira/connections/c1',
        expect.objectContaining({ method: 'DELETE' }),
      ),
    );
    // After the DELETE resolves the store is updated to an empty list.
    expect(storeRef.current.setConnections).toHaveBeenCalledWith([]);
    expect(localConfig.saveJiraConnections).toHaveBeenCalled();
  });

  it('tests a connection via POST /api/jira/test', async () => {
    storeRef.current.connections = [SEED_CONN];
    renderWithProviders(<ConnectionsPanel />);
    fireEvent.click(screen.getByText('Test'));
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/jira/test',
        expect.objectContaining({ method: 'POST' }),
      ),
    );
  });
});
