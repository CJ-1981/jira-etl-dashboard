/**
 * Tests for the DataSource seam implementations.
 *
 * - RelayDataSource: relay HTTP contract (sync/dataset/health), client-side
 *   calculation guard, localStorage-backed views, client holidays/export.
 * - ServerDataSource: request-body contracts preserved from the pre-seam
 *   fetch call sites, plus error/status propagation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RelayDataSource } from '@/lib/datasource/relay';
import { ServerDataSource } from '@/lib/datasource/server';
import type { ExtractParams } from '@/lib/datasource/types';
import { localConfig } from '@/lib/config/local-store';
import type { JiraConnection } from '@/lib/config/local-store';

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status });

const CONNECTION: JiraConnection = {
  id: 'c1',
  name: 'Conn',
  baseUrl: 'https://jira.example.com',
  apiToken: 'tok',
  email: 'a@b.com',
  projectKeys: 'PROJ',
  isActive: true,
};

function extractParams(overrides: Partial<ExtractParams> = {}): ExtractParams {
  return {
    connectionRef: 'c1',
    connection: CONNECTION,
    customPlugins: [],
    saveExtraction: true,
    updateOnly: false,
    customFields: [{ id: 'f1', fieldId: 'customfield_10002', label: 'Story Points', role: 'storyPoints' }],
    storageConfig: null,
    ...overrides,
  };
}

// ── RelayDataSource ──────────────────────────────────────────────────────────

describe('RelayDataSource', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;
  let relay: RelayDataSource;

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    fetchMock = vi.spyOn(global, 'fetch');
    relay = new RelayDataSource();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('loadMasterDataset maps the relay /dataset payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: true,
      data: {
        totalExtracted: 2,
        issues: [{ key: 'A-1' }, { key: 'A-2' }],
        dateRange: { from: '2026-01-01', to: '2026-06-01' },
        lastUpdated: '2026-06-01T00:00:00Z',
      },
    }));

    const data = await relay.loadMasterDataset('conn-1', {});

    expect(data).toEqual({
      totalExtracted: 2,
      issues: [{ key: 'A-1' }, { key: 'A-2' }],
      dateRange: { from: '2026-01-01', to: '2026-06-01' },
      lastUpdated: '2026-06-01T00:00:00Z',
    });
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('/dataset?connection=conn-1');
  });

  it('loadMasterDataset returns null on relay failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }, 500));
    await expect(relay.loadMasterDataset('conn-1', {})).resolves.toBeNull();
  });

  it('extract syncs then reloads the dataset for the preview list', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        summary: { totalExtracted: 3, added: 3, updated: 0, unchanged: 0, deleted: 0, jql: 'j', timestamp: 't' },
      }))
      .mockResolvedValueOnce(jsonResponse({
        success: true,
        data: { totalExtracted: 5, issues: [{ key: 'B-1' }], lastUpdated: 'u' },
      }));

    const result = await relay.extract(extractParams({ jql: 'project = "PROJ"' }));

    expect(result.etlRunId).toBe('relay-sync');
    expect(result.summary.totalExtracted).toBe(3);
    expect(result.issues).toEqual([{ key: 'B-1' }]);

    const [syncUrl, syncInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(syncUrl).toContain('/sync');
    const body = JSON.parse(syncInit.body as string);
    expect(body.connectionRef).toBe('c1');
    expect(body.projectKeys).toBe('PROJ');
    expect(body.jql).toBe('project = "PROJ"');
    expect(body.customFieldIds).toEqual(['customfield_10002']);
    expect(body.storyPointsFieldId).toBe('customfield_10002');
  });

  it('extract surfaces relay errors with the upstream status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'no credentials' }, 400));
    await expect(relay.extract(extractParams())).rejects.toMatchObject({ status: 400 });
  });

  it('calculateKpis refuses to run without an in-memory dataset', async () => {
    await expect(
      relay.calculateKpis({ connectionId: 'c1', storageConfig: null }),
    ).rejects.toThrow(/requires inline issues/);
  });

  it('persists dashboard views in localStorage with one default per connection', async () => {
    const a = await relay.createView('conn-1', { name: 'A', data: '{}' });
    await relay.createView('conn-2', { name: 'B', data: '{}' });

    expect((await relay.listViews('conn-1')).map(v => v.name)).toEqual(['A']);
    expect((await relay.listAllViews())).toHaveLength(2);

    const updated = await relay.updateView(a.id, { data: '{"x":1}' });
    expect(updated.data).toBe('{"x":1}');

    await relay.setDefaultView(a.id, true);
    await expect(relay.setDefaultView(a.id, true)).resolves.toBeUndefined();
    expect(relay.listViews('conn-1').then(vs => vs.find(v => v.id === a.id)?.isDefault)).resolves.toBe(true);

    await relay.deleteView(a.id);
    expect(await relay.listViews('conn-1')).toEqual([]);
  });

  it('getHolidays filters national holidays client-side', async () => {
    const result = await relay.getHolidays(2026, 'national');
    expect(result.year).toBe(2026);
    expect(result.holidays.length).toBeGreaterThan(0);
    expect(result.holidays.every(h => h.isNational)).toBe(true);
    expect(result.holidays[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('exportKpiFile returns a CSV blob with the KPI header row', async () => {
    const blob = await relay.exportKpiFile({
      issues: [],
      regions: ['national'],
      format: 'csv',
    });
    const text = await blob.text();
    expect(blob.type).toContain('text/csv');
    expect(text.split('\n')[0]).toContain('kpi_id,kpi_name,value');
  });

  it('exportKpiFile supports JSON output', async () => {
    const blob = await relay.exportKpiFile({ issues: [], regions: [], format: 'json' });
    // calculateAll still emits zeroed results for every registered plugin.
    const parsed = JSON.parse(await blob.text());
    expect(Object.keys(parsed).length).toBeGreaterThan(0);
    expect(parsed.throughput).toBeDefined();
  });

  it('testConnection reports an unreachable relay without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await relay.testConnection(CONNECTION);
    expect(result.success).toBe(false);
    expect(result.error).toContain('ALLOWED_ORIGIN');
  });

  it('deleteConnectionData issues a DELETE against the relay dataset', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true, deleted: 3 }));
    await expect(relay.deleteConnectionData('conn-1')).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/dataset?connection=conn-1');
    expect(init.method).toBe('DELETE');
  });
});

// ── ServerDataSource ─────────────────────────────────────────────────────────

describe('ServerDataSource', () => {
  let fetchMock: ReturnType<typeof vi.spyOn>;
  let server: ServerDataSource;

  beforeEach(() => {
    vi.restoreAllMocks();
    fetchMock = vi.spyOn(global, 'fetch');
    server = new ServerDataSource();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extract posts the jiraCredentials body shape the route expects', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: true,
      etlRunId: 'run-1',
      summary: { totalExtracted: 1, added: 1, updated: 0, unchanged: 0, deleted: 0, jql: 'j', timestamp: 't' },
      issues: [{ key: 'A-1' }],
    }));

    const result = await server.extract(extractParams());

    expect(result.etlRunId).toBe('run-1');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/jira/extract');
    const body = JSON.parse(init.body as string);
    expect(body.jiraCredentials).toEqual({
      baseUrl: CONNECTION.baseUrl,
      email: CONNECTION.email,
      apiToken: CONNECTION.apiToken,
      projectKeys: 'PROJ',
    });
    expect(body.customFieldIds).toEqual(['customfield_10002']);
    expect(body.storyPointsFieldId).toBe('customfield_10002');
  });

  it('extract re-throws route errors with the upstream HTTP status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'bad token' }, 401));
    await expect(server.extract(extractParams())).rejects.toMatchObject({ status: 401 });
  });

  it('loadMasterDataset maps the route payload and nulls failures', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      success: true,
      data: { totalExtracted: 1, issues: [{ key: 'A-1' }], lastUpdated: 'u' },
    }));
    await expect(server.loadMasterDataset('c1', { storageConfig: null })).resolves.toMatchObject({
      totalExtracted: 1,
    });

    fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }, 500));
    await expect(server.loadMasterDataset('c1', { storageConfig: null })).resolves.toBeNull();
  });

  it('deleteConnectionData throws when the route reports failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false, error: 'nope' }, 500));
    await expect(server.deleteConnectionData('c1')).rejects.toThrow('nope');
  });

  it('listAllViews yields [] on unsuccessful bulk payloads', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: false }, 500));
    await expect(server.listAllViews(null)).resolves.toEqual([]);
  });

  it('getHolidays forwards year/region query params', async () => {
    fetchMock.mockResolvedValue(jsonResponse({
      success: true,
      year: 2026,
      region: 'national',
      holidays: [{ date: '2026-01-01', name: "New Year's Day", nameLocal: 'Neujahr', isNational: true, regions: ['national'] }],
      states: [],
    }));

    const result = await server.getHolidays(2026, 'national');
    const url = (fetchMock.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('year=2026');
    expect(url).toContain('region=national');
    expect(result.holidays).toHaveLength(1);
  });

  it('exportKpiFile throws on a failed export route', async () => {
    fetchMock.mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(server.exportKpiFile({ issues: [], regions: [], format: 'csv' })).rejects.toThrow();
  });
});

// ── runtime mode flags ───────────────────────────────────────────────────────

describe('runtime mode (test env runs the server bundle)', () => {
  it('defaults to server mode with all server capabilities on', async () => {
    const { getAppMode, isRelayMode, runtimeFeatures } = await import('@/lib/runtime/mode');
    expect(getAppMode()).toBe('server');
    expect(isRelayMode()).toBe(false);
    expect(runtimeFeatures.hasServerApis).toBe(true);
    expect(runtimeFeatures.hasFilePlugins).toBe(true);
    expect(runtimeFeatures.hasStoragePanel).toBe(true);
    expect(runtimeFeatures.hasPgExport).toBe(true);
    expect(runtimeFeatures.hasPolling).toBe(true);
    expect(runtimeFeatures.hasFieldDiscovery).toBe(true);
  });
});
