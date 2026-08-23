/**
 * Route-handler coverage for the miscellaneous KPI / API routes.
 *
 * Covers (happy path + important branches):
 *  - GET  /api
 *  - GET  /api/debug/health            (base + ?detailed=true)
 *  - GET  /api/db/location
 *  - GET  /api/holidays                (year/region + start/end range)
 *  - GET  /api/kpi/plugins
 *  - GET/POST/PUT/DELETE /api/kpi/plugins/custom (incl. loopback-origin guard)
 *  - GET  /api/kpi/plugins/events      (?lastEventId)
 *  - POST /api/kpi/calculate           (loopback guard; inline issues; 400 branch)
 *  - POST /api/export/file             (format json / csv; missing-issues 400)
 *
 * Mocking strategy (file-level vi.mock, hoisted):
 *  - '@/lib/db'              -> createMockDb() (getDb / getDefaultDb)
 *  - '@/lib/kpi/engine'      -> controllable mock engine (getKpiEngine + KpiEngine class)
 *  - '@/lib/kpi/plugin-watcher' -> controllable watcher (avoids chokidar)
 *  - 'fs'                   -> stubbed fs methods (custom-plugin file writes/deletes)
 * Holidays lib and logger are left real (pure, no filesystem).
 */

import { describe, it, expect, vi, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import { createMockDb, makeRequest, readJson } from '@/test/mock-db';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

// `vi.hoisted` callbacks run before ESM imports initialize, so we cannot call
// the imported `createMockDb` inside one. Instead, hoist an empty holder that
// the (lazily-invoked) vi.mock factory can close over, then assign the real
// mock db at top-level after imports are ready.
const dbRef = vi.hoisted(() => ({ current: null as null | ReturnType<typeof createMockDb> }));

vi.mock('@/lib/db', () => ({
  getDb: () => dbRef.current,
  getDefaultDb: () => dbRef.current,
}));

// Top-level (after imports): build the deep Prisma mock shared by all tests.
dbRef.current = createMockDb();

const engineMocks = vi.hoisted(() => {
  const fns = {
    getAllPlugins: vi.fn((): any[] => []),
    getPlugin: vi.fn((): any => undefined),
    unregister: vi.fn(),
    calculateAll: vi.fn(() => ({})),
    register: vi.fn(),
    registerCustomPlugin: vi.fn(),
  };
  // Shared instance returned by getKpiEngine(); methods reference the same fns so
  // per-test mockReturnValue overrides affect both the singleton and new instances.
  const engineInstance = {
    getAllPlugins: fns.getAllPlugins,
    getPlugin: fns.getPlugin,
    unregister: fns.unregister,
    calculateAll: fns.calculateAll,
    register: fns.register,
    registerCustomPlugin: fns.registerCustomPlugin,
  };
  return { fns, engineInstance };
});

vi.mock('@/lib/kpi/engine', () => ({
  getKpiEngine: () => engineMocks.engineInstance,
  KpiEngine: class MockKpiEngine {
    getAllPlugins = engineMocks.fns.getAllPlugins;
    getPlugin = engineMocks.fns.getPlugin;
    unregister = engineMocks.fns.unregister;
    calculateAll = engineMocks.fns.calculateAll;
    register = engineMocks.fns.register;
    registerCustomPlugin = engineMocks.fns.registerCustomPlugin;
  },
}));

const watcherMock = vi.hoisted(() => ({
  isActive: vi.fn(() => false),
  start: vi.fn(),
  getEventCounter: vi.fn(() => 0),
}));

vi.mock('@/lib/kpi/plugin-watcher', () => ({
  getPluginWatcher: () => watcherMock,
}));

const fsMock = vi.hoisted(() => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  accessSync: vi.fn(() => {
    throw new Error('mock fs: access denied');
  }),
  readdirSync: vi.fn(() => []),
  constants: { W_OK: 2, R_OK: 4 },
  promises: { unlink: vi.fn(() => Promise.resolve()) },
}));

vi.mock('fs', () => ({ ...fsMock, default: fsMock }));

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const CANNED_RESULTS = {
  throughput: [{ name: 'Throughput', value: 5, unit: 'count' }],
};

const SAMPLE_ISSUE = {
  key: 'PROJ-1',
  self: 'http://localhost/jira/PROJ-1',
  fields: {
    summary: 'Test issue',
    issuetype: { name: 'Story' },
    priority: { name: 'High' },
    status: { name: 'Done', statusCategory: { name: 'Done' } },
    assignee: { displayName: 'Alice', emailAddress: 'alice@example.com' },
    reporter: { displayName: 'Bob', emailAddress: 'bob@example.com' },
    created: '2026-01-02T09:00:00.000Z',
    updated: '2026-01-15T17:00:00.000Z',
    resolutiondate: '2026-01-15T17:00:00.000Z',
    labels: [],
    components: [],
  },
};

const BUILTIN_PLUGIN = {
  id: 'throughput',
  name: 'Throughput',
  description: 'Resolved ticket count',
  category: 'builtin',
  domain: 'throughput',
  unit: 'count',
};

const CUSTOM_PLUGIN = {
  id: 'my-cust',
  name: 'My Custom Plugin',
  description: 'A custom plugin',
  category: 'custom',
  domain: 'custom',
  version: '1.0.0',
  unit: 'count',
  isActive: true,
};

// Silence noisy route logging (route tests assert on responses, not logs).
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  vi.restoreAllMocks();
});

beforeEach(() => {
  // Clear call history (keeps createMockDb implementations intact), then reset
  // the controllable mocks to deterministic defaults for each test.
  vi.clearAllMocks();

  engineMocks.fns.getAllPlugins.mockReturnValue([]);
  engineMocks.fns.getPlugin.mockReturnValue(undefined);
  engineMocks.fns.calculateAll.mockReturnValue({});
  engineMocks.fns.unregister.mockClear();
  engineMocks.fns.registerCustomPlugin.mockClear();

  fsMock.existsSync.mockReturnValue(true);
  fsMock.mkdirSync.mockClear();
  fsMock.writeFileSync.mockClear();
  fsMock.promises.unlink.mockClear();

  watcherMock.isActive.mockReturnValue(false);
  watcherMock.start.mockClear();
  watcherMock.getEventCounter.mockReturnValue(0);
});

// ─── GET /api/debug/health ────────────────────────────────────────────────────

describe('GET /api/debug/health', () => {
  it('returns healthy status without database check by default', async () => {
    const { GET } = await import('@/app/api/debug/health/route');
    const res = await GET(makeRequest('/api/debug/health'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.health.status).toBe('healthy');
    expect(body.health.database).toBeUndefined();
  });

  it('performs a database $queryRaw and surfaces logs when ?detailed=true', async () => {
    const { GET } = await import('@/app/api/debug/health/route');
    const res = await GET(makeRequest('/api/debug/health?detailed=true'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.health.status).toBe('healthy');
    expect(body.health.database).toEqual({ status: 'connected' });
    // The detailed branch must invoke the default DB's $queryRaw.
    expect(dbRef.current!.$queryRaw).toHaveBeenCalled();
    expect(body.health).toHaveProperty('errorCount');
    expect(Array.isArray(body.health.logs)).toBe(true);
  });
});

// ─── GET /api/db/location ─────────────────────────────────────────────────────

describe('GET /api/db/location', () => {
  const origDb = process.env.DATABASE_URL;
  const origNextDb = process.env.NEXT_PUBLIC_DATABASE_URL;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    delete process.env.NEXT_PUBLIC_DATABASE_URL;
  });

  afterEach(() => {
    if (origDb === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = origDb;
    if (origNextDb === undefined) delete process.env.NEXT_PUBLIC_DATABASE_URL;
    else process.env.NEXT_PUBLIC_DATABASE_URL = origNextDb;
  });

  it('reports the relative dev default when no DATABASE_URL is set', async () => {
    const { GET } = await import('@/app/api/db/location/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.url).toBe('file:./db/custom.db');
    expect(body.relative).toBe(true);
    expect(body.path).toBeNull();
    expect(body.hint).toContain('Development mode');
  });

  it('reports an absolute path when DATABASE_URL is absolute', async () => {
    process.env.DATABASE_URL = 'file:/var/data/custom.db';
    const { GET } = await import('@/app/api/db/location/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.relative).toBe(false);
    expect(body.path).toBe('/var/data/custom.db');
    expect(body.hint).toBeUndefined();
  });
});

// ─── GET /api/holidays ────────────────────────────────────────────────────────

describe('GET /api/holidays', () => {
  it('returns national holidays for a year with the national region', async () => {
    const { GET } = await import('@/app/api/holidays/route');
    const res = await GET(makeRequest('/api/holidays?year=2025&region=national'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.year).toBe(2025);
    expect(body.region).toBe('national');
    expect(body.holidays.length).toBeGreaterThan(0);
    // Only national holidays survive the national-region filter.
    expect(body.holidays.every((h: { isNational: boolean }) => h.isNational)).toBe(true);
    expect(body.holidays.some((h: { name: string }) => h.name === "New Year's Day")).toBe(true);
    expect(body.states.length).toBeGreaterThan(0);
  });

  it('includes regional holidays for a specific state (BW)', async () => {
    const { GET } = await import('@/app/api/holidays/route');
    const res = await GET(makeRequest('/api/holidays?year=2025&region=BW'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.region).toBe('BW');
    // BW observes Epiphany as a regional holiday.
    expect(body.holidays.some((h: { name: string }) => h.name === 'Epiphany')).toBe(true);
    // More holidays than the national-only set.
    expect(body.holidays.length).toBeGreaterThan(11);
  });

  it('uses the start/end range branch and filters by region', async () => {
    const { GET } = await import('@/app/api/holidays/route');
    const res = await GET(
      makeRequest('/api/holidays?start=2025-01-01&end=2025-12-31&region=BW'),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.holidays.length).toBeGreaterThan(0);
    // National + BW regional for the full year. Use mid-range holidays to stay
    // timezone-robust: ISO date strings parse as UTC midnight, so a holiday whose
    // local-midnight instant lands on Jan 1 can fall before the range start in
    // UTC+ zones. Labour Day (May 1) and Epiphany (Jan 6, BW regional) are safe.
    expect(body.holidays.some((h: { name: string }) => h.name === 'Labour Day')).toBe(true);
    expect(body.holidays.some((h: { name: string }) => h.name === 'Epiphany')).toBe(true);
  });
});

// ─── GET /api/kpi/plugins ─────────────────────────────────────────────────────

describe('GET /api/kpi/plugins', () => {
  it('returns the built-in plugin list tagged as builtin and active', async () => {
    engineMocks.fns.getAllPlugins.mockReturnValue([BUILTIN_PLUGIN]);
    const { GET } = await import('@/app/api/kpi/plugins/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.plugins).toHaveLength(1);
    expect(body.plugins[0]).toEqual({
      id: 'throughput',
      name: 'Throughput',
      description: 'Resolved ticket count',
      category: 'builtin',
      domain: 'throughput',
      unit: 'count',
      pluginType: 'builtin',
      isActive: true,
    });
  });
});

// ─── /api/kpi/plugins/custom (GET/POST/PUT/DELETE) ────────────────────────────

describe('/api/kpi/plugins/custom', () => {
  describe('GET', () => {
    it('returns only custom plugins from the engine', async () => {
      engineMocks.fns.getAllPlugins.mockReturnValue([CUSTOM_PLUGIN, BUILTIN_PLUGIN]);
      const { GET } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(body.plugins).toHaveLength(1);
      expect(body.plugins[0].id).toBe('my-cust');
      expect(body.plugins[0].isActive).toBe(true);
    });

    it('returns an empty list when no custom plugins are registered', async () => {
      engineMocks.fns.getAllPlugins.mockReturnValue([BUILTIN_PLUGIN]);
      const { GET } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await GET();
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(body.plugins).toEqual([]);
    });
  });

  describe('POST', () => {
    it('creates a custom plugin file when called from loopback (no origin)', async () => {
      const { POST } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await POST(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'POST',
          body: {
            id: 'my-plugin',
            name: 'My Plugin',
            domain: 'test-domain',
            unit: 'count',
            calculate: '() => 0',
            description: 'desc',
            version: '1.2.0',
          },
        }),
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(body.plugin.id).toBe('my-plugin');
      expect(fsMock.mkdirSync).toHaveBeenCalledWith(
        expect.any(String),
        { recursive: true },
      );
      expect(fsMock.writeFileSync).toHaveBeenCalledWith(
        expect.stringContaining('my-plugin.ts'),
        expect.any(String),
        'utf-8',
      );
    });

    it('rejects cross-origin requests (CSRF guard)', async () => {
      const { POST } = await import('@/app/api/kpi/plugins/custom/route');
      const crossReq = new Request('http://localhost/api/kpi/plugins/custom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', origin: 'https://evil.com' },
        body: JSON.stringify({
          id: 'x',
          name: 'x',
          domain: 'x',
          unit: 'x',
          calculate: 'x',
        }),
      });
      const res = await POST(crossReq);
      expect(res.status).toBe(401);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Cross-origin');
      // Must not have touched the filesystem.
      expect(fsMock.writeFileSync).not.toHaveBeenCalled();
    });

    it('rejects requests with missing required fields', async () => {
      const { POST } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await POST(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'POST',
          body: { id: 'only-id' },
        }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Missing required fields');
    });

    it('rejects unsafe id/domain segments (path traversal guard)', async () => {
      const { POST } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await POST(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'POST',
          body: {
            id: '../escape',
            name: 'evil',
            domain: 'd',
            unit: 'u',
            calculate: '() => 0',
          },
        }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('unsafe characters');
    });
  });

  describe('PUT', () => {
    it('enables/disables a custom plugin', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...CUSTOM_PLUGIN });
      const { PUT } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await PUT(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'PUT',
          body: { pluginId: 'my-cust', isActive: false },
        }),
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(body.message).toContain('disabled');
      expect(body.plugin.isActive).toBe(false);
    });

    it('returns 400 when required fields are missing', async () => {
      const { PUT } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await PUT(
        makeRequest('/api/kpi/plugins/custom', { method: 'PUT', body: { pluginId: 'x' } }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Missing required fields');
    });

    it('returns 404 when the plugin is not found', async () => {
      engineMocks.fns.getPlugin.mockReturnValue(undefined);
      const { PUT } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await PUT(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'PUT',
          body: { pluginId: 'missing', isActive: true },
        }),
      );
      expect(res.status).toBe(404);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Plugin not found');
    });

    it('returns 400 when the plugin is not custom', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...BUILTIN_PLUGIN, category: 'builtin' });
      const { PUT } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await PUT(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'PUT',
          body: { pluginId: 'throughput', isActive: false },
        }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Only custom plugins');
    });

    it('rejects cross-origin requests (CSRF guard)', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...CUSTOM_PLUGIN });
      const { PUT } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await PUT(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'PUT',
          body: { pluginId: 'my-cust', isActive: false },
          headers: { origin: 'https://evil.example' },
        }),
      );
      expect(res.status).toBe(401);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Cross-origin');
    });

    it('accepts a localhost origin', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...CUSTOM_PLUGIN });
      const { PUT } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await PUT(
        makeRequest('/api/kpi/plugins/custom', {
          method: 'PUT',
          body: { pluginId: 'my-cust', isActive: false },
          headers: { origin: 'http://localhost:3000' },
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe('DELETE', () => {
    it('deletes a custom plugin file and unregisters it', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...CUSTOM_PLUGIN });
      fsMock.existsSync.mockReturnValue(true);
      const { DELETE } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await DELETE(
        makeRequest('/api/kpi/plugins/custom?pluginId=my-cust', { method: 'DELETE' }),
      );
      expect(res.status).toBe(200);
      const body = await readJson(res);
      expect(body.success).toBe(true);
      expect(body.message).toContain('deleted');
      expect(fsMock.promises.unlink).toHaveBeenCalledWith(expect.stringContaining('my-cust.ts'));
      expect(engineMocks.fns.unregister).toHaveBeenCalledWith('my-cust');
    });

    it('returns 400 when pluginId is missing', async () => {
      const { DELETE } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await DELETE(makeRequest('/api/kpi/plugins/custom', { method: 'DELETE' }));
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Missing pluginId');
    });

    it('returns 404 when the plugin is not found', async () => {
      engineMocks.fns.getPlugin.mockReturnValue(undefined);
      const { DELETE } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await DELETE(
        makeRequest('/api/kpi/plugins/custom?pluginId=missing', { method: 'DELETE' }),
      );
      expect(res.status).toBe(404);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Plugin not found');
    });

    it('returns 400 when deleting a non-custom plugin', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...BUILTIN_PLUGIN, category: 'builtin' });
      const { DELETE } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await DELETE(
        makeRequest('/api/kpi/plugins/custom?pluginId=throughput', { method: 'DELETE' }),
      );
      expect(res.status).toBe(400);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Only custom plugins');
    });

    it('rejects cross-origin requests (CSRF guard)', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...CUSTOM_PLUGIN });
      const { DELETE } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await DELETE(
        makeRequest('/api/kpi/plugins/custom?pluginId=my-cust', {
          method: 'DELETE',
          headers: { origin: 'https://evil.example' },
        }),
      );
      expect(res.status).toBe(401);
      const body = await readJson(res);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Cross-origin');
      // Must not have deleted anything.
      expect(fsMock.promises.unlink).not.toHaveBeenCalled();
      expect(engineMocks.fns.unregister).not.toHaveBeenCalled();
    });

    it('accepts a localhost origin', async () => {
      engineMocks.fns.getPlugin.mockReturnValue({ ...CUSTOM_PLUGIN });
      const { DELETE } = await import('@/app/api/kpi/plugins/custom/route');
      const res = await DELETE(
        makeRequest('/api/kpi/plugins/custom?pluginId=my-cust', {
          method: 'DELETE',
          headers: { origin: 'http://localhost:3000' },
        }),
      );
      expect(res.status).toBe(200);
    });
  });
});

// ─── GET /api/kpi/plugins/events ──────────────────────────────────────────────

describe('GET /api/kpi/plugins/events', () => {
  it('starts the watcher and reports no changes when counter is zero', async () => {
    watcherMock.isActive.mockReturnValue(false);
    watcherMock.getEventCounter.mockReturnValue(0);
    const { GET } = await import('@/app/api/kpi/plugins/events/route');
    const res = await GET(makeRequest('/api/kpi/plugins/events'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.hasChanges).toBe(false);
    expect(body.message).toBe('No changes');
    expect(watcherMock.start).toHaveBeenCalled();
  });

  it('reports changes when lastEventId is behind the counter', async () => {
    watcherMock.isActive.mockReturnValue(true);
    watcherMock.getEventCounter.mockReturnValue(5);
    const { GET } = await import('@/app/api/kpi/plugins/events/route');
    const res = await GET(makeRequest('/api/kpi/plugins/events?lastEventId=2'));
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.eventCounter).toBe(5);
    expect(body.hasChanges).toBe(true);
    expect(body.message).toBe('Plugin changes detected');
    // Already active -> must not start again.
    expect(watcherMock.start).not.toHaveBeenCalled();
  });
});

// ─── POST /api/kpi/calculate ──────────────────────────────────────────────────

describe('POST /api/kpi/calculate', () => {
  it('runs the engine on inline issues and returns flattened results', async () => {
    engineMocks.fns.calculateAll.mockReturnValue(CANNED_RESULTS);
    const { POST } = await import('@/app/api/kpi/calculate/route');
    const res = await POST(
      makeRequest('/api/kpi/calculate', {
        method: 'POST',
        body: {
          issues: [SAMPLE_ISSUE],
          holidays: { regions: ['BW'] },
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.holidays.regions).toEqual(['BW']);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].pluginId).toBe('throughput');
    expect(body.results[0].results[0].value).toBe(5);
    expect(engineMocks.fns.calculateAll).toHaveBeenCalledTimes(1);
  });

  it('returns 400 when neither issues nor connectionId+storageConfig are provided', async () => {
    const { POST } = await import('@/app/api/kpi/calculate/route');
    const res = await POST(
      makeRequest('/api/kpi/calculate', { method: 'POST', body: {} }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Either issues array or connectionId');
  });

  it('rejects cross-origin requests (CSRF guard)', async () => {
    const { POST } = await import('@/app/api/kpi/calculate/route');
    const crossReq = new Request('http://localhost/api/kpi/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://evil.com' },
      body: JSON.stringify({ issues: [SAMPLE_ISSUE] }),
    });
    const res = await POST(crossReq);
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Cross-origin');
  });
});

// ─── POST /api/export/file ────────────────────────────────────────────────────

describe('POST /api/export/file', () => {
  it('returns JSON when format is json', async () => {
    engineMocks.fns.calculateAll.mockReturnValue(CANNED_RESULTS);
    const { POST } = await import('@/app/api/export/file/route');
    const res = await POST(
      makeRequest('/api/export/file', {
        method: 'POST',
        body: {
          issues: [SAMPLE_ISSUE],
          holidays: { regions: ['BW'] },
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          format: 'json',
        },
      }),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body).toEqual(CANNED_RESULTS);
  });

  it('returns text/csv with a header row when format is csv', async () => {
    engineMocks.fns.calculateAll.mockReturnValue(CANNED_RESULTS);
    const { POST } = await import('@/app/api/export/file/route');
    const res = await POST(
      makeRequest('/api/export/file', {
        method: 'POST',
        body: {
          issues: [SAMPLE_ISSUE],
          holidays: { regions: ['BW'] },
          dateFrom: '2026-01-01',
          dateTo: '2026-01-31',
          format: 'csv',
        },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('jira-kpi-export.csv');
    const text = await res.text();
    expect(text.split('\n')[0]).toContain('kpi_id');
    expect(text).toContain('throughput');
  });

  it('returns 400 when issues are missing', async () => {
    const { POST } = await import('@/app/api/export/file/route');
    const res = await POST(
      makeRequest('/api/export/file', { method: 'POST', body: { format: 'json' } }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.error).toContain('Issues array is required');
  });
});

// ─── POST /api/pg/export ──────────────────────────────────────────────────────

describe('POST /api/pg/export', () => {
  const exportBody = {
    connection: { host: 'localhost', username: 'user', database: 'postgres' },
    issues: [SAMPLE_ISSUE],
    exportDataType: 'tickets',
  };

  it('exports issues to the target database (loopback, no origin header)', async () => {
    const { POST } = await import('@/app/api/pg/export/route');
    const res = await POST(
      makeRequest('/api/pg/export', { method: 'POST', body: exportBody }),
    );
    expect(res.status).toBe(200);
    const body = await readJson(res);
    expect(body.success).toBe(true);
    expect(body.rowCount).toBe(1);
    expect(dbRef.current!.masterTicket.upsert).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-origin requests (CSRF guard)', async () => {
    const { POST } = await import('@/app/api/pg/export/route');
    const res = await POST(
      makeRequest('/api/pg/export', {
        method: 'POST',
        body: exportBody,
        headers: { origin: 'https://evil.example' },
      }),
    );
    expect(res.status).toBe(401);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Cross-origin');
    expect(dbRef.current!.masterTicket.upsert).not.toHaveBeenCalled();
  });

  it('accepts a localhost origin', async () => {
    const { POST } = await import('@/app/api/pg/export/route');
    const res = await POST(
      makeRequest('/api/pg/export', {
        method: 'POST',
        body: exportBody,
        headers: { origin: 'http://localhost:3000' },
      }),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).success).toBe(true);
  });

  it('returns 400 when connection details are missing', async () => {
    const { POST } = await import('@/app/api/pg/export/route');
    const res = await POST(
      makeRequest('/api/pg/export', {
        method: 'POST',
        body: { issues: [SAMPLE_ISSUE] },
      }),
    );
    expect(res.status).toBe(400);
    const body = await readJson(res);
    expect(body.success).toBe(false);
    expect(body.error).toContain('Database connection details are required');
  });
});
