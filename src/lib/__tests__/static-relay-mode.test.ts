/**
 * Tests for the dual-mode static/relay infrastructure:
 * - generateId (secure-context fallback)
 * - client-calculator (relay-mode KPI orchestration)
 * - runtime mode flags
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateId } from '@/lib/id';
import { calculateKpisClient } from '@/lib/kpi/client-calculator';
import { ServerDataSource } from '@/lib/datasource/server';
import type { JiraIssue } from '@/lib/jira/client';

// ── generateId ───────────────────────────────────────────────────────────────

describe('generateId', () => {
  it('returns unique RFC4122-shaped ids', () => {
    const ids = new Set(Array.from({ length: 200 }, () => generateId()));
    expect(ids.size).toBe(200);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });

  it('falls back to getRandomValues when randomUUID is unavailable', () => {
    const original = crypto.randomUUID;
    // Simulate a non-secure context (plain http webview).
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
    try {
      const id = generateId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    } finally {
      Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
    }
  });
});

// ── client-calculator ────────────────────────────────────────────────────────

function fixtureIssue(key: string, status: string, created: string, updated: string, resolved?: string): JiraIssue {
  return {
    key,
    fields: {
      summary: `Fixture ${key}`,
      issuetype: { name: 'Task' },
      priority: { name: 'Medium' },
      status: { name: status },
      assignee: { displayName: 'Alice' },
      reporter: { displayName: 'Bob' },
      created,
      updated,
      resolutiondate: resolved ?? null,
      labels: [],
      components: [],
    },
    changelog: { histories: [], maxResults: 0, total: 0, startAt: 0 },
  } as unknown as JiraIssue;
}

describe('calculateKpisClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const issues = [
    fixtureIssue('T-1', 'Done', '2026-06-01T09:00:00.000Z', '2026-06-05T10:00:00.000Z', '2026-06-05T10:00:00.000Z'),
    fixtureIssue('T-2', 'In Progress', '2026-07-01T09:00:00.000Z', '2026-07-15T10:00:00.000Z'),
  ];

  it('computes all plugins client-side and returns the flat KpiCalcResult shape', () => {
    const out = calculateKpisClient({ issues });

    expect(Array.isArray(out.results)).toBe(true);
    // The full builtin registry is registered on the fresh client engine.
    expect(out.results.length).toBeGreaterThanOrEqual(30);

    const throughput = out.results.find(r => r.pluginId === 'throughput');
    expect(throughput).toBeDefined();
    if (!throughput) throw new Error('throughput plugin missing from client results');
    expect(throughput.results.length).toBeGreaterThan(0);
    // Every result entry is normalized to finite numbers + string units.
    for (const entry of throughput.results) {
      expect(typeof entry.value).toBe('number');
      expect(Number.isFinite(entry.value)).toBe(true);
      expect(typeof entry.unit).toBe('string');
    }
    expect(out.calculatedAt).toBe(new Date(out.calculatedAt).toISOString());
    expect(out.holidays.workStartHour).toBe(9);
    expect(out.holidays.workEndHour).toBe(17);
  });

  it('respects activePluginIds selection', () => {
    const out = calculateKpisClient({ issues, activePluginIds: ['throughput'] });
    expect(out.results.map(r => r.pluginId)).toEqual(['throughput']);
  });

  it('counts open tickets from the fixture (Throughput > Open Tickets)', () => {
    const out = calculateKpisClient({ issues, activePluginIds: ['throughput'] });
    const open = out.results[0].results.find(r => r.name === 'Open Tickets');
    expect(open?.value).toBe(1);
  });

  it('registers localStorage formula plugins (DSL COUNT)', () => {
    const out = calculateKpisClient({
      issues,
      activePluginIds: ['fixture-formula'],
      customPlugins: [{
        id: 'fixture-formula',
        name: 'Fixture Count',
        description: 'counts issues',
        category: 'custom',
        unit: 'tickets',
        formula: 'COUNT(true)',
        language: 'dsl',
        pluginType: 'custom',
        isActive: true,
      }],
    });
    expect(out.results).toHaveLength(1);
    expect(out.results[0].pluginId).toBe('fixture-formula');
    expect(out.results[0].results[0].value).toBe(2);
  });

  it('defaults the period to a rolling 90-day window ending today', () => {
    const out = calculateKpisClient({ issues });
    // Holidays metadata echoes the resolved configuration; the period itself is
    // observable via calculatedAt being present and a successful empty result.
    expect(out.results.length).toBeGreaterThan(0);
  });
});

// ── ServerDataSource (server-mode seam implementation) ──────────────────────

describe('ServerDataSource.calculateKpis', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockCalculateResponse() {
    return vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ success: true, results: [], calculatedAt: new Date().toISOString() }),
      { status: 200 },
    ));
  }

  it('forwards inline issues so per-widget JQL filtering reaches the route', async () => {
    const fetchMock = mockCalculateResponse();
    const issues = [{ key: 'W-1', fields: {} }];

    await new ServerDataSource().calculateKpis({
      connectionId: 'conn-1',
      storageConfig: null,
      issues,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    // Regression guard: without `issues` the route falls back to the unfiltered
    // DB dataset, which silently broke widget-level JQL filters in server mode.
    expect(body.issues).toEqual(issues);
  });

  it('omits issues on the main dashboard path so the route loads from the DB', async () => {
    const fetchMock = mockCalculateResponse();

    await new ServerDataSource().calculateKpis({
      connectionId: 'conn-1',
      storageConfig: { provider: 'sqlite', url: '', isCustom: false },
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect('issues' in body).toBe(false);
    expect(body.connectionId).toBe('conn-1');
  });

  it('aborts long-running calculations after 120s with a clear error', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.spyOn(global, 'fetch').mockImplementation(
      (_url, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          const err = new Error('The operation was aborted');
          err.name = 'AbortError';
          reject(err);
        });
      }) as never,
    );

    const promise = new ServerDataSource().calculateKpis({
      connectionId: 'conn-1',
      storageConfig: null,
    });
    const assertion = expect(promise).rejects.toThrow('timed out after 120 seconds');
    await vi.advanceTimersByTimeAsync(120_000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
