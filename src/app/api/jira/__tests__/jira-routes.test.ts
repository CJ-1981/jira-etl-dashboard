import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createMockDb, makeRequest, readJson } from '@/test/mock-db';

// ───────────────────────── Shared module mocks ─────────────────────────
// The routes all reach the database via `getDb(...)`. A holder gives each
// test a fresh mock DB (smart defaults, no leakage of per-test overrides).
const holder = vi.hoisted(() => ({ db: null as any }));
vi.mock('@/lib/db', () => ({ getDb: () => holder.db }));

// JiraClient is mocked so the extract route never makes a real HTTP call.
// `extractIssues` is a controllable mock fn (default: empty issues array).
const jiraMock = vi.hoisted(() => {
  const extractIssues = vi.fn().mockResolvedValue([] as any[]);
  class JiraClient {
    config: any;
    fieldMapping: any;
    extractIssues: any;
    constructor(config: any, fieldMapping?: any) {
      this.config = config;
      this.fieldMapping = fieldMapping ?? {};
      // Bind the controllable mock as an instance method.
      this.extractIssues = extractIssues;
    }
    buildDefaultJql(_opts?: any) {
      return 'project = "TEST" ORDER BY created DESC';
    }
  }
  const extractSelectFieldValue = vi.fn((f: any) => {
    if (!f) return null;
    if (typeof f === 'string') return f;
    if (Array.isArray(f)) return f.map((x) => x?.value ?? x).filter(Boolean).join(', ');
    if (typeof f === 'object') return f.value ?? f.displayName ?? f.name ?? null;
    return String(f);
  });
  return { JiraClient, extractSelectFieldValue, extractIssues };
});
vi.mock('@/lib/jira/client', () => ({
  JiraClient: jiraMock.JiraClient,
  extractSelectFieldValue: jiraMock.extractSelectFieldValue,
}));

// KPI engine — avoid the real plugin loader / filesystem reads.
vi.mock('@/lib/kpi/engine', () => ({
  getKpiEngine: () => ({
    calculateAll: () => ({}),
    getPlugin: () => undefined,
  }),
}));

beforeEach(() => {
  holder.db = createMockDb();
});

// ───────────────────────── Route imports (after mocks) ─────────────────────────
import { POST as storagePOST } from '@/app/api/jira/extract/storage/route';
import { POST as cleanupPOST } from '@/app/api/jira/extract/cleanup/route';
import { POST as latestPOST } from '@/app/api/jira/extract/latest/[connectionId]/route';
import {
  POST as masterPOST,
  DELETE as masterDELETE,
} from '@/app/api/jira/master/[connectionId]/route';
import { DELETE as connectionsDELETE } from '@/app/api/jira/connections/[connectionId]/route';
import { GET as pollGET, POST as pollPOST } from '@/app/api/jira/poll/route';
import { POST as extractPOST } from '@/app/api/jira/extract/route';

// Helper to build the 2nd-arg context for dynamic [connectionId] routes.
const ctx = (connectionId: string) => ({
  params: Promise.resolve({ connectionId }),
});

// ───────────────────────── POST /api/jira/extract/storage ─────────────────────────
describe('POST /api/jira/extract/storage', () => {
  it('returns aggregated storage stats for active connections', async () => {
    holder.db.etlRun.aggregate.mockResolvedValue({
      _sum: { sizeBytes: 2048 },
      _min: { completedAt: '2026-01-01T00:00:00.000Z' },
      _max: { completedAt: '2026-01-31T00:00:00.000Z' },
    });
    const res = await storagePOST(
      makeRequest('/api/jira/extract/storage', {
        method: 'POST',
        body: {
          activeConnections: [
            { id: 'c1', name: 'Conn1' },
            { id: 'c2', name: 'Conn2' },
          ],
        },
      })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.storage.byConnection).toHaveLength(2);
    expect(json.storage.totalSizeMB).toBeGreaterThan(0);
    expect(holder.db.masterTicket.count).toHaveBeenCalled();
    expect(holder.db.etlRun.aggregate).toHaveBeenCalled();
  });

  it('degrades to empty stats when activeConnections is missing', async () => {
    const res = await storagePOST(
      makeRequest('/api/jira/extract/storage', { method: 'POST', body: {} })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.storage.byConnection).toEqual([]);
    expect(json.storage.totalExtractions).toBe(0);
  });

  it('degrades to empty stats when the body is unparseable JSON', async () => {
    const req = new Request('http://localhost/api/jira/extract/storage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not valid json',
    });
    const res = await storagePOST(req);
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.storage.byConnection).toEqual([]);
  });
});

// ───────────────────────── POST /api/jira/extract/cleanup ─────────────────────────
describe('POST /api/jira/extract/cleanup', () => {
  it('deletes runs older than retentionDays (cascading)', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([
      { id: 'r1', sizeBytes: 1024 },
      { id: 'r2', sizeBytes: 2048 },
    ]);
    const res = await cleanupPOST(
      makeRequest('/api/jira/extract/cleanup', {
        method: 'POST',
        body: { retentionDays: 30 },
      })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.deleted.etlRuns).toBe(2);
    expect(holder.db.kpiResult.deleteMany).toHaveBeenCalled();
    expect(holder.db.etlRun.deleteMany).toHaveBeenCalled();
  });

  it('runs the cascade deletion inside a transaction', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([
      { id: 'r1', sizeBytes: 1048576 },
      { id: 'r2', sizeBytes: 2048 },
    ]);
    holder.db.ticketSnapshot.findMany.mockResolvedValue([{ id: 's1' }]);
    const res = await cleanupPOST(
      makeRequest('/api/jira/extract/cleanup', {
        method: 'POST',
        body: { retentionDays: 30 },
      })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    // The whole cascade is wrapped in a transaction.
    expect(holder.db.$transaction).toHaveBeenCalled();
    // FK-safe order: children before parents.
    const ordered = [
      holder.db.kpiResult.deleteMany,
      holder.db.ticketTransition.deleteMany,
      holder.db.ticketSnapshot.deleteMany,
      holder.db.etlRun.deleteMany,
    ];
    ordered.forEach((fn) => expect(fn).toHaveBeenCalled());
    const invocations = ordered.map((fn) => fn.mock.invocationCallOrder[0]);
    for (let i = 0; i < invocations.length - 1; i++) {
      expect(invocations[i]).toBeLessThan(invocations[i + 1]);
    }
  });

  it('locks the deleted-count response shape (etlRuns + freedSpaceMB)', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([
      { id: 'r1', sizeBytes: 1048576 },
      { id: 'r2', sizeBytes: 1048576 },
    ]);
    const res = await cleanupPOST(
      makeRequest('/api/jira/extract/cleanup', {
        method: 'POST',
        body: { retentionDays: 30 },
      })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.deleted).toEqual({ etlRuns: 2, freedSpaceMB: 2 });
  });

  it('skips the transaction entirely when no runs match the cutoff', async () => {
    // etlRun.findMany defaults to []
    const res = await cleanupPOST(
      makeRequest('/api/jira/extract/cleanup', {
        method: 'POST',
        body: { retentionDays: 30 },
      })
    );
    expect(res.status).toBe(200);
    expect(holder.db.$transaction).not.toHaveBeenCalled();
    expect(holder.db.kpiResult.deleteMany).not.toHaveBeenCalled();
    expect(holder.db.etlRun.deleteMany).not.toHaveBeenCalled();
  });

  it('uses beforeDate as the cutoff when provided', async () => {
    const res = await cleanupPOST(
      makeRequest('/api/jira/extract/cleanup', {
        method: 'POST',
        body: { beforeDate: '2026-01-01' },
      })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.deleted.etlRuns).toBe(0);
    expect(holder.db.etlRun.findMany).toHaveBeenCalled();
  });

  it('rejects when neither retentionDays nor beforeDate is provided', async () => {
    const res = await cleanupPOST(
      makeRequest('/api/jira/extract/cleanup', { method: 'POST', body: {} })
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid cleanup parameters');
  });

  describe('loopback-origin guard', () => {
    const body = { retentionDays: 30 };

    it('rejects an external origin with 401', async () => {
      const res = await cleanupPOST(
        makeRequest('/api/jira/extract/cleanup', {
          method: 'POST',
          body,
          headers: { origin: 'https://evil.example' },
        })
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(holder.db.etlRun.deleteMany).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await cleanupPOST(
        makeRequest('/api/jira/extract/cleanup', { method: 'POST', body })
      );
      expect(res.status).toBe(200);
    });

    it('accepts a localhost origin', async () => {
      const res = await cleanupPOST(
        makeRequest('/api/jira/extract/cleanup', {
          method: 'POST',
          body,
          headers: { origin: 'http://localhost:3000' },
        })
      );
      expect(res.status).toBe(200);
    });
  });
});

// ───────────────────────── POST /api/jira/extract/latest/[connectionId] ─────────────────────────
describe('POST /api/jira/extract/latest/[connectionId]', () => {
  it('reconstructs issues from the latest run + master tickets', async () => {
    holder.db.etlRun.findFirst.mockResolvedValue({
      id: 'run-1',
      completedAt: new Date('2026-01-31'),
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      jql: 'project = "TEST"',
      ticketsProcessed: 1,
      ticketSnapshots: [],
    });
    holder.db.masterTicket.findMany.mockResolvedValue([
      {
        jiraKey: 'TEST-1',
        rawData: undefined,
        summary: 'Sum',
        issueType: 'Bug',
        priority: 'High',
        status: 'Open',
        assignee: 'Alice',
        reporter: 'Bob',
        issueOwnerTeam: 'Team A',
        created: new Date('2026-01-01'),
        updated: new Date('2026-01-02'),
        resolved: null,
        dueDate: null,
        storyPoints: 5,
        labels: '[]',
        components: '[]',
      },
    ]);
    const res = await latestPOST(
      makeRequest('/api/jira/extract/latest/c1', { method: 'POST', body: {} }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.data.issues).toHaveLength(1);
    expect(json.data.issues[0].key).toBe('TEST-1');
    expect(json.data.etlRunId).toBe('run-1');
  });

  it('returns a no-data response when no saved extraction exists', async () => {
    // findFirst defaults to null
    const res = await latestPOST(
      makeRequest('/api/jira/extract/latest/c1', { method: 'POST', body: {} }),
      ctx('c1')
    );
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/No saved extractions/i);
  });
});

// ───────────────────────── POST /api/jira/master/[connectionId] ─────────────────────────
describe('POST /api/jira/master/[connectionId]', () => {
  it('action:get returns reconstructed issues when data exists', async () => {
    holder.db.masterTicket.findMany.mockResolvedValue([
      {
        jiraKey: 'TEST-1',
        rawData: JSON.stringify({
          fields: { summary: 'Sum', customfield_9999: 'X' },
        }),
        summary: 'Sum',
        issueType: 'Bug',
        priority: 'High',
        status: 'Open',
        assignee: 'Alice',
        reporter: 'Bob',
        issueOwnerTeam: 'Team A',
        created: new Date('2026-01-01'),
        updated: new Date('2026-01-02'),
        resolved: null,
        dueDate: null,
        storyPoints: 5,
        labels: '[]',
        components: '[]',
        lastUpdatedAt: new Date('2026-01-02'),
      },
    ]);
    const res = await masterPOST(
      makeRequest('/api/jira/master/c1', { method: 'POST', body: { action: 'get' } }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.data.issues).toHaveLength(1);
    expect(json.data.issues[0].key).toBe('TEST-1');
    // raw custom fields must survive the lightweight reconstruction
    expect(json.data.issues[0].fields.customfield_9999).toBe('X');
  });

  it('action:get returns an empty dataset when no master tickets exist', async () => {
    // findMany defaults to []
    const res = await masterPOST(
      makeRequest('/api/jira/master/c1', { method: 'POST', body: { action: 'get' } }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.data.totalExtracted).toBe(0);
    expect(json.data.issues).toEqual([]);
  });

  it('action:delete cascades through related records', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);
    const res = await masterPOST(
      makeRequest('/api/jira/master/c1', { method: 'POST', body: { action: 'delete' } }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(holder.db.etlRun.findMany).toHaveBeenCalled();
    expect(holder.db.kpiResult.deleteMany).toHaveBeenCalled();
    expect(holder.db.masterTicket.deleteMany).toHaveBeenCalled();
  });

  it('action:delete runs the cascade inside a transaction', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);
    const res = await masterPOST(
      makeRequest('/api/jira/master/c1', { method: 'POST', body: { action: 'delete' } }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    // The whole cascade is wrapped in a transaction.
    expect(holder.db.$transaction).toHaveBeenCalled();
    expect(holder.db.etlRun.findMany).toHaveBeenCalled();
    expect(holder.db.masterTicket.deleteMany).toHaveBeenCalled();
  });

  it('action:delete locks the response message shape and aggregated counts', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    holder.db.ticketSnapshot.findMany.mockResolvedValue([{ id: 's1' }]);
    // kpiResult is targeted twice (by connectionRef, then by etlRunId); the
    // second pass is a no-op in production, so model it as matching 0 rows.
    holder.db.kpiResult.deleteMany.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        'connectionRef' in args.where ? { count: 3 } : { count: 0 }
    );
    holder.db.dashboardView.deleteMany.mockResolvedValue({ count: 4 });
    holder.db.ticketTransition.deleteMany.mockResolvedValue({ count: 5 });
    holder.db.ticketSnapshot.deleteMany.mockResolvedValue({ count: 6 });
    holder.db.etlRun.deleteMany.mockResolvedValue({ count: 2 });
    holder.db.masterTicket.deleteMany.mockResolvedValue({ count: 7 });
    const res = await masterPOST(
      makeRequest('/api/jira/master/c1', { method: 'POST', body: { action: 'delete' } }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    // deletedCount aggregates every deleteMany, including master tickets.
    expect(json.message).toBe(
      'Cleared 2 extractions, 7 master tickets, and 27 related records.'
    );
  });

  it('rejects an unknown action', async () => {
    const res = await masterPOST(
      makeRequest('/api/jira/master/c1', { method: 'POST', body: { action: 'noop' } }),
      ctx('c1')
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid action');
  });

  describe('loopback-origin guard', () => {
    it('rejects an external origin with 401', async () => {
      const res = await masterPOST(
        makeRequest('/api/jira/master/c1', {
          method: 'POST',
          body: { action: 'delete' },
          headers: { origin: 'https://evil.example' },
        }),
        ctx('c1')
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(holder.db.masterTicket.deleteMany).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await masterPOST(
        makeRequest('/api/jira/master/c1', { method: 'POST', body: { action: 'get' } }),
        ctx('c1')
      );
      expect(res.status).toBe(200);
    });

    it('accepts a localhost origin', async () => {
      const res = await masterPOST(
        makeRequest('/api/jira/master/c1', {
          method: 'POST',
          body: { action: 'get' },
          headers: { origin: 'http://localhost:3000' },
        }),
        ctx('c1')
      );
      expect(res.status).toBe(200);
    });
  });
});

// ───────────────────────── DELETE /api/jira/master/[connectionId] ─────────────────────────
describe('DELETE /api/jira/master/[connectionId]', () => {
  it('cascades delete on a DELETE request', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);
    const res = await masterDELETE(
      makeRequest('/api/jira/master/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(holder.db.masterTicket.deleteMany).toHaveBeenCalled();
    expect(holder.db.etlRun.deleteMany).toHaveBeenCalled();
  });

  it('runs the cascade inside a transaction', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);
    const res = await masterDELETE(
      makeRequest('/api/jira/master/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    // The whole cascade is wrapped in a transaction.
    expect(holder.db.$transaction).toHaveBeenCalled();
    expect(holder.db.masterTicket.deleteMany).toHaveBeenCalled();
    expect(holder.db.etlRun.deleteMany).toHaveBeenCalled();
  });

  it('locks the response message shape and aggregated counts', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    holder.db.ticketSnapshot.findMany.mockResolvedValue([{ id: 's1' }]);
    // kpiResult is targeted twice (by connectionRef, then by etlRunId); the
    // second pass is a no-op in production, so model it as matching 0 rows.
    holder.db.kpiResult.deleteMany.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        'connectionRef' in args.where ? { count: 3 } : { count: 0 }
    );
    holder.db.dashboardView.deleteMany.mockResolvedValue({ count: 4 });
    holder.db.ticketTransition.deleteMany.mockResolvedValue({ count: 5 });
    holder.db.ticketSnapshot.deleteMany.mockResolvedValue({ count: 6 });
    holder.db.etlRun.deleteMany.mockResolvedValue({ count: 2 });
    holder.db.masterTicket.deleteMany.mockResolvedValue({ count: 7 });
    const res = await masterDELETE(
      makeRequest('/api/jira/master/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    // deletedCount aggregates every deleteMany, including master tickets.
    expect(json.message).toBe(
      'Cleared 2 extractions, 7 master tickets, and 27 related records.'
    );
  });

  describe('loopback-origin guard', () => {
    it('rejects an external origin with 401', async () => {
      const res = await masterDELETE(
        makeRequest('/api/jira/master/c1', {
          method: 'DELETE',
          headers: { origin: 'https://evil.example' },
        }),
        ctx('c1')
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(holder.db.masterTicket.deleteMany).not.toHaveBeenCalled();
    });

    it('accepts a localhost origin', async () => {
      const res = await masterDELETE(
        makeRequest('/api/jira/master/c1', {
          method: 'DELETE',
          headers: { origin: 'http://localhost:3000' },
        }),
        ctx('c1')
      );
      expect(res.status).toBe(200);
    });
  });
});

// ───────────────────────── DELETE /api/jira/connections/[connectionId] ─────────────────────────
describe('DELETE /api/jira/connections/[connectionId]', () => {
  it('cascades delete of ETL runs and master tickets inside a transaction', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    const res = await connectionsDELETE(
      makeRequest('/api/jira/connections/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    // The whole cascade is wrapped in a transaction.
    expect(holder.db.$transaction).toHaveBeenCalled();
    expect(holder.db.etlRun.findMany).toHaveBeenCalled();
    expect(holder.db.etlRun.deleteMany).toHaveBeenCalled();
    expect(holder.db.masterTicket.deleteMany).toHaveBeenCalled();
  });

  it('deletes KPI results by connectionRef (covers orphaned rows with NULL etlRunId)', async () => {
    const res = await connectionsDELETE(
      makeRequest('/api/jira/connections/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    expect(holder.db.kpiResult.deleteMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1' },
    });
  });

  it('deletes dashboard views for the connection', async () => {
    const res = await connectionsDELETE(
      makeRequest('/api/jira/connections/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    expect(holder.db.dashboardView.deleteMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1' },
    });
  });

  it('deletes children before parents (FK-safe order)', async () => {
    holder.db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);
    holder.db.ticketSnapshot.findMany.mockResolvedValue([{ id: 's1' }]);
    const res = await connectionsDELETE(
      makeRequest('/api/jira/connections/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    // Expected FK-safe order: referencing rows are removed before the rows
    // they reference (kpiResult→etlRun, transition→snapshot, snapshot→etlRun).
    const ordered = [
      holder.db.kpiResult.deleteMany,
      holder.db.dashboardView.deleteMany,
      holder.db.ticketTransition.deleteMany,
      holder.db.ticketSnapshot.deleteMany,
      holder.db.etlRun.deleteMany,
      holder.db.masterTicket.deleteMany,
    ];
    ordered.forEach((fn) => expect(fn).toHaveBeenCalled());
    const invocations = ordered.map((fn) => fn.mock.invocationCallOrder[0]);
    for (let i = 0; i < invocations.length - 1; i++) {
      expect(invocations[i]).toBeLessThan(invocations[i + 1]);
    }
  });

  it('succeeds with zero extractions (empty case)', async () => {
    // findMany defaults to []
    const res = await connectionsDELETE(
      makeRequest('/api/jira/connections/c1', { method: 'DELETE' }),
      ctx('c1')
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/0 extractions/);
    // run-scoped cascade skipped because there are no runs
    expect(holder.db.etlRun.deleteMany).not.toHaveBeenCalled();
    // connection-scoped deletes still run so nothing is orphaned
    expect(holder.db.kpiResult.deleteMany).toHaveBeenCalled();
    expect(holder.db.dashboardView.deleteMany).toHaveBeenCalled();
    expect(holder.db.masterTicket.deleteMany).toHaveBeenCalled();
  });

  it('rejects cross-origin requests (loopback-origin guard)', async () => {
    const req = new Request('http://localhost/api/jira/connections/c1', {
      method: 'DELETE',
      headers: { origin: 'https://evil.com' },
    });
    const res = await connectionsDELETE(req, ctx('c1'));
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Cross-origin request rejected');
    // Nothing was deleted.
    expect(holder.db.$transaction).not.toHaveBeenCalled();
  });
});

// ───────────────────────── /api/jira/poll ─────────────────────────
describe('/api/jira/poll', () => {
  beforeEach(() => {
    // Fake timers so the background interval can never actually fire.
    vi.useFakeTimers();
    const g = global as any;
    if (g.pollTimer) {
      clearInterval(g.pollTimer);
      g.pollTimer = null;
    }
    // Mutate (not replace) the existing state object so the route's captured
    // reference still observes the reset.
    const ps = g.pollingState;
    if (ps) {
      Object.assign(ps, {
        enabled: false,
        connectionId: '',
        intervalMinutes: 15,
        dateFrom: '',
        dateTo: '',
        jql: '',
        daysBack: null,
        lastRunAt: null,
        nextRunAt: null,
        runCount: 0,
        status: 'idle',
        lastError: null,
        lastRunSummary: null,
        lastRunId: 0,
        storageConfig: undefined,
        jiraCredentials: undefined,
        extractOptions: undefined,
      });
    }
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('GET returns sanitized polling state', async () => {
    const res = await pollGET();
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.polling).toBeDefined();
    expect(json.polling.enabled).toBe(false);
    // credentials must be stripped from the response
    expect(json.polling.jiraCredentials).toBeUndefined();
  });

  it('POST enable starts polling and echoes the enabled state', async () => {
    const res = await pollPOST(
      makeRequest('/api/jira/poll', {
        method: 'POST',
        body: {
          enabled: true,
          connectionId: 'c1',
          intervalMinutes: 15,
          jiraCredentials: {
            baseUrl: 'https://x.atlassian.net',
            email: 'a@b.com',
            apiToken: 'tok',
          },
        },
      })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.polling.enabled).toBe(true);
    expect(json.polling.connectionId).toBe('c1');
  });

  it('POST disable stops polling', async () => {
    const res = await pollPOST(
      makeRequest('/api/jira/poll', { method: 'POST', body: { enabled: false } })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.polling.enabled).toBe(false);
    expect(json.polling.nextRunAt).toBeNull();
  });

  it('POST ping returns sanitized state', async () => {
    const res = await pollPOST(
      makeRequest('/api/jira/poll', { method: 'POST', body: { action: 'ping' } })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.polling).toBeDefined();
  });

  describe('loopback-origin guard', () => {
    it('rejects an external origin with 401', async () => {
      const res = await pollPOST(
        makeRequest('/api/jira/poll', {
          method: 'POST',
          body: { enabled: false },
          headers: { origin: 'https://evil.example' },
        })
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
    });

    it('accepts a header-less request', async () => {
      const res = await pollPOST(
        makeRequest('/api/jira/poll', { method: 'POST', body: { enabled: false } })
      );
      expect(res.status).toBe(200);
    });

    it('accepts a localhost origin', async () => {
      const res = await pollPOST(
        makeRequest('/api/jira/poll', {
          method: 'POST',
          body: { enabled: false },
          headers: { origin: 'http://localhost:3000' },
        })
      );
      expect(res.status).toBe(200);
    });
  });
});

// ───────────────────────── POST /api/jira/extract ─────────────────────────
describe('POST /api/jira/extract', () => {
  const goodBody = {
    connectionRef: 'c1',
    jiraCredentials: {
      baseUrl: 'https://test.atlassian.net',
      email: 'a@b.com',
      apiToken: 'tok',
      projectKeys: 'TEST',
    },
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
  };

  it('runs the happy path and returns a success summary', async () => {
    holder.db.etlRun.create.mockResolvedValue({ id: 'run-1' });
    jiraMock.extractIssues.mockResolvedValueOnce([
      {
        key: 'TEST-1',
        fields: {
          summary: 'Sum',
          issuetype: { name: 'Bug' },
          status: { name: 'Open' },
          created: '2026-01-01T00:00:00.000Z',
          updated: '2026-01-02T00:00:00.000Z',
        },
        changelog: { histories: [] },
      },
      {
        key: 'TEST-2',
        fields: {
          summary: 'Sum2',
          issuetype: { name: 'Task' },
          status: { name: 'Done' },
          created: '2026-01-03T00:00:00.000Z',
          updated: '2026-01-04T00:00:00.000Z',
        },
        changelog: { histories: [] },
      },
    ]);
    const res = await extractPOST(
      makeRequest('/api/jira/extract', { method: 'POST', body: goodBody })
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.etlRunId).toBe('run-1');
    expect(json.summary.totalExtracted).toBe(2);
    expect(jiraMock.extractIssues).toHaveBeenCalled();
    expect(holder.db.etlRun.create).toHaveBeenCalled();
    expect(holder.db.etlRun.update).toHaveBeenCalled();
  });

  it('preserves the Jira HTTP status (401) and explicit message when extractIssues throws an auth error', async () => {
    holder.db.etlRun.create.mockResolvedValue({ id: 'run-1' });
    jiraMock.extractIssues.mockRejectedValueOnce(
      Object.assign(new Error('Authentication failed (HTTP 401). Your API token is invalid or expired.'), { status: 401 })
    );
    const res = await extractPOST(
      makeRequest('/api/jira/extract', { method: 'POST', body: goodBody })
    );
    // The route forwards the upstream status (was always 500 before) so the
    // panel's tailored 401 toast fires, with the explicit message as the body.
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/invalid or expired/i);
  });

  it('preserves a 429 status when extractIssues throws a rate-limit error', async () => {
    holder.db.etlRun.create.mockResolvedValue({ id: 'run-2' });
    jiraMock.extractIssues.mockRejectedValueOnce(
      Object.assign(new Error('Jira rate limit exceeded (HTTP 429).'), { status: 429 })
    );
    const res = await extractPOST(
      makeRequest('/api/jira/extract', { method: 'POST', body: goodBody })
    );
    expect(res.status).toBe(429);
    expect((await readJson(res)).error).toMatch(/rate limit/i);
  });

  it('rejects cross-origin requests (loopback-origin guard)', async () => {
    const req = new Request('http://localhost/api/jira/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'https://evil.com' },
      body: '{}',
    });
    const res = await extractPOST(req);
    expect(res.status).toBe(401);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Cross-origin request rejected');
  });

  it('rejects an invalid JSON body', async () => {
    const req = new Request('http://localhost/api/jira/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    const res = await extractPOST(req);
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Invalid JSON body');
  });

  it('rejects when connectionRef is missing', async () => {
    const res = await extractPOST(
      makeRequest('/api/jira/extract', {
        method: 'POST',
        body: { jiraCredentials: goodBody.jiraCredentials },
      })
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('connectionRef is required');
  });

  it('rejects when jira credentials are missing', async () => {
    const res = await extractPOST(
      makeRequest('/api/jira/extract', {
        method: 'POST',
        body: { connectionRef: 'c1' },
      })
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Jira credentials are required');
  });
});
