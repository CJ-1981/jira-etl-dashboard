import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockDb, makeRequest, readJson } from '@/test/mock-db';

// Mutable holder so each test can start from a fresh mock DB (clean smart
// defaults + clean call history). The holder is created empty inside
// vi.hoisted (import bindings are not yet initialized there) and populated
// with a fresh createMockDb() in beforeEach. The vi.mock factory reads from
// this holder, so the route handlers always observe the current mock instance.
const { dbRef } = vi.hoisted(() => ({ dbRef: { current: undefined as any } }));
vi.mock('@/lib/db', () => ({ getDb: () => dbRef.current }));

import { GET as viewsGet, POST as viewsPost } from '@/app/api/dashboard/views/route';
import { GET as bulkGet, POST as bulkPost } from '@/app/api/dashboard/views/bulk/route';
import { PATCH, DELETE } from '@/app/api/dashboard/views/[id]/route';
import {
  POST as setDefault,
  DELETE as clearDefault,
} from '@/app/api/dashboard/views/[id]/default/route';

const mockDb = () => dbRef.current;
const STORAGE_CONFIG = 'file:./db/custom.db';

beforeEach(() => {
  dbRef.current = createMockDb() as any;
});

describe('GET/POST /api/dashboard/views', () => {
  it('GET returns views for a connectionRef (happy path)', async () => {
    mockDb().dashboardView.findMany.mockResolvedValue([
      { id: 'v1', name: 'My View', connectionRef: 'c1' },
    ]);
    const res = await viewsGet(
      makeRequest('/api/dashboard/views?connectionRef=c1'),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.views).toHaveLength(1);
    expect(json.views[0].id).toBe('v1');
    expect(mockDb().dashboardView.findMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1' },
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('GET returns an empty list when no views exist', async () => {
    // default findMany resolves to []
    const res = await viewsGet(
      makeRequest('/api/dashboard/views?connectionRef=c1'),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.views).toEqual([]);
  });

  it('GET returns 400 when connectionRef is missing', async () => {
    const res = await viewsGet(makeRequest('/api/dashboard/views'));
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/connectionRef is required/);
  });

  it('GET parses a storageConfig query param', async () => {
    const sc = encodeURIComponent(JSON.stringify({ provider: 'sqlite' }));
    const res = await viewsGet(
      makeRequest(`/api/dashboard/views?connectionRef=c1&storageConfig=${sc}`),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).success).toBe(true);
  });

  it('POST creates a view, clearing previous defaults when isDefault', async () => {
    mockDb().dashboardView.create.mockResolvedValue({
      id: 'v2',
      name: 'New',
      isDefault: true,
    });
    const res = await viewsPost(
      makeRequest('/api/dashboard/views', {
        method: 'POST',
        body: {
          connectionRef: 'c1',
          name: 'New',
          data: { filters: ['x'] },
          isDefault: true,
          autoSaveEnabled: true,
          storageConfig: STORAGE_CONFIG,
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.view.id).toBe('v2');
    // isDefault branch: previous defaults for the connection cleared
    expect(mockDb().dashboardView.updateMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1', isDefault: true },
      data: { isDefault: false },
    });
    expect(mockDb().dashboardView.create).toHaveBeenCalled();
  });

  it('POST returns 400 when required fields are missing', async () => {
    const res = await viewsPost(
      makeRequest('/api/dashboard/views', {
        method: 'POST',
        body: { connectionRef: 'c1' },
      }),
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Missing required fields/);
  });
});

describe('GET/POST /api/dashboard/views/bulk', () => {
  it('GET returns all views across connections', async () => {
    mockDb().dashboardView.findMany.mockResolvedValue([
      { id: 'v1' },
      { id: 'v2' },
    ]);
    const res = await bulkGet(makeRequest('/api/dashboard/views/bulk'));
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.views).toHaveLength(2);
    expect(mockDb().dashboardView.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: 'desc' },
    });
  });

  it('GET parses a storageConfig query param', async () => {
    const sc = encodeURIComponent(JSON.stringify({ provider: 'sqlite' }));
    const res = await bulkGet(
      makeRequest(`/api/dashboard/views/bulk?storageConfig=${sc}`),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).success).toBe(true);
  });

  it('POST bulk upserts a list of views', async () => {
    mockDb().dashboardView.upsert.mockResolvedValue({ id: 'v1' });
    const res = await bulkPost(
      makeRequest('/api/dashboard/views/bulk', {
        method: 'POST',
        body: {
          views: [
            {
              id: 'v1',
              name: 'A',
              connectionRef: 'c1',
              data: { x: 1 },
              isDefault: true,
            },
            { name: 'B', connectionRef: 'c1', data: 'raw' },
          ],
          storageConfig: STORAGE_CONFIG,
        },
      }),
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);
    expect(mockDb().dashboardView.upsert).toHaveBeenCalledTimes(2);
    // isDefault branch in bulk import: clear other defaults for the connection
    expect(mockDb().dashboardView.updateMany).toHaveBeenCalledWith({
      where: {
        connectionRef: 'c1',
        isDefault: true,
        id: { not: 'v1' },
      },
      data: { isDefault: false },
    });
  });

  it('POST returns 400 when views is not an array', async () => {
    const res = await bulkPost(
      makeRequest('/api/dashboard/views/bulk', {
        method: 'POST',
        body: { storageConfig: STORAGE_CONFIG },
      }),
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/Views array is required/);
  });
});

describe('PATCH/DELETE /api/dashboard/views/[id]', () => {
  it('PATCH updates a view and enforces the single-default invariant', async () => {
    mockDb().dashboardView.findUnique.mockResolvedValue({
      id: 'v1',
      connectionRef: 'c1',
    });
    mockDb().dashboardView.update.mockResolvedValue({
      id: 'v1',
      name: 'Updated',
      isDefault: true,
    });
    const res = await PATCH(
      makeRequest('/api/dashboard/views/v1', {
        method: 'PATCH',
        body: { name: 'Updated', isDefault: true, storageConfig: STORAGE_CONFIG },
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(json.view.name).toBe('Updated');
    expect(mockDb().dashboardView.updateMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1', isDefault: true, id: { not: 'v1' } },
      data: { isDefault: false },
    });
  });

  it('PATCH returns 404 when the view is not found', async () => {
    mockDb().dashboardView.findUnique.mockResolvedValue(null);
    const res = await PATCH(
      makeRequest('/api/dashboard/views/v1', {
        method: 'PATCH',
        body: { name: 'X', storageConfig: STORAGE_CONFIG },
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(404);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/View not found/);
  });

  it('DELETE removes a view (happy path)', async () => {
    mockDb().dashboardView.delete.mockResolvedValue({ id: 'v1' });
    const res = await DELETE(
      makeRequest('/api/dashboard/views/v1', {
        method: 'DELETE',
        body: { storageConfig: STORAGE_CONFIG },
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(mockDb().dashboardView.delete).toHaveBeenCalledWith({
      where: { id: 'v1' },
    });
  });

  it('DELETE returns 400 when storageConfig is missing', async () => {
    const res = await DELETE(
      makeRequest('/api/dashboard/views/v1', {
        method: 'DELETE',
        body: {},
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(400);
    const json = await readJson(res);
    expect(json.success).toBe(false);
    expect(json.error).toMatch(/storageConfig is required/);
  });
});

describe('POST/DELETE /api/dashboard/views/[id]/default', () => {
  it('POST sets a view as the default for its connection', async () => {
    mockDb().dashboardView.findUnique.mockResolvedValue({
      id: 'v1',
      connectionRef: 'c1',
    });
    mockDb().dashboardView.update.mockResolvedValue({
      id: 'v1',
      isDefault: true,
    });
    const res = await setDefault(
      makeRequest('/api/dashboard/views/v1/default', {
        method: 'POST',
        body: { storageConfig: STORAGE_CONFIG },
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(mockDb().dashboardView.updateMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1', isDefault: true },
      data: { isDefault: false },
    });
    expect(mockDb().dashboardView.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { isDefault: true },
    });
  });

  it('POST set-default returns 400 when storageConfig is missing', async () => {
    const res = await setDefault(
      makeRequest('/api/dashboard/views/v1/default', {
        method: 'POST',
        body: {},
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).success).toBe(false);
  });

  it('POST set-default returns 404 when the view is not found', async () => {
    mockDb().dashboardView.findUnique.mockResolvedValue(null);
    const res = await setDefault(
      makeRequest('/api/dashboard/views/v1/default', {
        method: 'POST',
        body: { storageConfig: STORAGE_CONFIG },
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(404);
    expect((await readJson(res)).success).toBe(false);
  });

  it('DELETE clears the default status from a view', async () => {
    mockDb().dashboardView.update.mockResolvedValue({
      id: 'v1',
      isDefault: false,
    });
    const res = await clearDefault(
      makeRequest('/api/dashboard/views/v1/default', {
        method: 'DELETE',
        body: { storageConfig: STORAGE_CONFIG },
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(200);
    const json = await readJson(res);
    expect(json.success).toBe(true);
    expect(mockDb().dashboardView.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { isDefault: false },
    });
  });

  it('DELETE clear-default returns 400 when storageConfig is missing', async () => {
    const res = await clearDefault(
      makeRequest('/api/dashboard/views/v1/default', {
        method: 'DELETE',
        body: {},
      }),
      { params: Promise.resolve({ id: 'v1' }) },
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).success).toBe(false);
  });
});

// ─── Loopback-origin guard (CSRF protection) ─────────────────────────────────
// Every mutating dashboard-views handler must reject non-loopback origins with
// 401, accept header-less requests, and accept localhost origins.

const EXTERNAL_ORIGIN = 'https://evil.example';
const LOCALHOST_ORIGIN = 'http://localhost:3000';

describe('loopback-origin guard on mutating views routes', () => {
  const ctxV1 = () => ({ params: Promise.resolve({ id: 'v1' }) });

  describe('POST /api/dashboard/views', () => {
    const body = {
      connectionRef: 'c1',
      name: 'New',
      data: { filters: [] },
      storageConfig: STORAGE_CONFIG,
    };

    it('rejects an external origin with 401', async () => {
      const res = await viewsPost(
        makeRequest('/api/dashboard/views', {
          method: 'POST',
          body,
          headers: { origin: EXTERNAL_ORIGIN },
        }),
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(mockDb().dashboardView.create).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await viewsPost(
        makeRequest('/api/dashboard/views', { method: 'POST', body }),
      );
      expect(res.status).toBe(200);
    });

    it('accepts a localhost origin', async () => {
      const res = await viewsPost(
        makeRequest('/api/dashboard/views', {
          method: 'POST',
          body,
          headers: { origin: LOCALHOST_ORIGIN },
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/dashboard/views/bulk', () => {
    const body = {
      views: [{ name: 'A', connectionRef: 'c1', data: 'raw' }],
      storageConfig: STORAGE_CONFIG,
    };

    it('rejects an external origin with 401', async () => {
      const res = await bulkPost(
        makeRequest('/api/dashboard/views/bulk', {
          method: 'POST',
          body,
          headers: { origin: EXTERNAL_ORIGIN },
        }),
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(mockDb().dashboardView.upsert).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await bulkPost(
        makeRequest('/api/dashboard/views/bulk', { method: 'POST', body }),
      );
      expect(res.status).toBe(200);
    });

    it('accepts a localhost origin', async () => {
      const res = await bulkPost(
        makeRequest('/api/dashboard/views/bulk', {
          method: 'POST',
          body,
          headers: { origin: LOCALHOST_ORIGIN },
        }),
      );
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /api/dashboard/views/[id]', () => {
    const body = { name: 'X', storageConfig: STORAGE_CONFIG };

    it('rejects an external origin with 401', async () => {
      const res = await PATCH(
        makeRequest('/api/dashboard/views/v1', {
          method: 'PATCH',
          body,
          headers: { origin: EXTERNAL_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(mockDb().dashboardView.update).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await PATCH(
        makeRequest('/api/dashboard/views/v1', { method: 'PATCH', body }),
        ctxV1(),
      );
      // Not blocked by the guard (404 because findUnique defaults to null).
      expect(res.status).not.toBe(401);
    });

    it('accepts a localhost origin', async () => {
      const res = await PATCH(
        makeRequest('/api/dashboard/views/v1', {
          method: 'PATCH',
          body,
          headers: { origin: LOCALHOST_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).not.toBe(401);
    });
  });

  describe('DELETE /api/dashboard/views/[id]', () => {
    const body = { storageConfig: STORAGE_CONFIG };

    it('rejects an external origin with 401', async () => {
      const res = await DELETE(
        makeRequest('/api/dashboard/views/v1', {
          method: 'DELETE',
          body,
          headers: { origin: EXTERNAL_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(mockDb().dashboardView.delete).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await DELETE(
        makeRequest('/api/dashboard/views/v1', { method: 'DELETE', body }),
        ctxV1(),
      );
      expect(res.status).toBe(200);
    });

    it('accepts a localhost origin', async () => {
      const res = await DELETE(
        makeRequest('/api/dashboard/views/v1', {
          method: 'DELETE',
          body,
          headers: { origin: LOCALHOST_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/dashboard/views/[id]/default', () => {
    const body = { storageConfig: STORAGE_CONFIG };

    it('rejects an external origin with 401', async () => {
      const res = await setDefault(
        makeRequest('/api/dashboard/views/v1/default', {
          method: 'POST',
          body,
          headers: { origin: EXTERNAL_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(mockDb().dashboardView.update).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await setDefault(
        makeRequest('/api/dashboard/views/v1/default', { method: 'POST', body }),
        ctxV1(),
      );
      // Not blocked by the guard (404 because findUnique defaults to null).
      expect(res.status).not.toBe(401);
    });

    it('accepts a localhost origin', async () => {
      const res = await setDefault(
        makeRequest('/api/dashboard/views/v1/default', {
          method: 'POST',
          body,
          headers: { origin: LOCALHOST_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).not.toBe(401);
    });
  });

  describe('DELETE /api/dashboard/views/[id]/default', () => {
    const body = { storageConfig: STORAGE_CONFIG };

    it('rejects an external origin with 401', async () => {
      const res = await clearDefault(
        makeRequest('/api/dashboard/views/v1/default', {
          method: 'DELETE',
          body,
          headers: { origin: EXTERNAL_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).toBe(401);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toBe('Cross-origin request rejected');
      expect(mockDb().dashboardView.update).not.toHaveBeenCalled();
    });

    it('accepts a header-less request', async () => {
      const res = await clearDefault(
        makeRequest('/api/dashboard/views/v1/default', { method: 'DELETE', body }),
        ctxV1(),
      );
      expect(res.status).toBe(200);
    });

    it('accepts a localhost origin', async () => {
      const res = await clearDefault(
        makeRequest('/api/dashboard/views/v1/default', {
          method: 'DELETE',
          body,
          headers: { origin: LOCALHOST_ORIGIN },
        }),
        ctxV1(),
      );
      expect(res.status).toBe(200);
    });
  });
});

// ─── storageConfig validation (StorageConfigSchema) ──────────────────────────

describe('storageConfig validation on views routes', () => {
  const ctxV1 = () => ({ params: Promise.resolve({ id: 'v1' }) });
  const INVALID_CONFIGS = [
    { provider: 'mongodb' },
    123,
    { provider: 'sqlite', url: 42 },
    '',
  ];

  it('POST /api/dashboard/views returns 400 for invalid storageConfig', async () => {
    for (const storageConfig of INVALID_CONFIGS) {
      const res = await viewsPost(
        makeRequest('/api/dashboard/views', {
          method: 'POST',
          body: {
            connectionRef: 'c1',
            name: 'New',
            data: { x: 1 },
            storageConfig,
          },
        }),
      );
      expect(res.status).toBe(400);
      const json = await readJson(res);
      expect(json.success).toBe(false);
      expect(json.error).toMatch(/Invalid storageConfig/);
    }
    expect(mockDb().dashboardView.create).not.toHaveBeenCalled();
  });

  it('POST /api/dashboard/views accepts a valid object storageConfig', async () => {
    const res = await viewsPost(
      makeRequest('/api/dashboard/views', {
        method: 'POST',
        body: {
          connectionRef: 'c1',
          name: 'New',
          data: { x: 1 },
          storageConfig: { provider: 'sqlite', url: '', isCustom: false },
        },
      }),
    );
    expect(res.status).toBe(200);
    expect((await readJson(res)).success).toBe(true);
  });

  it('POST /api/dashboard/views/bulk returns 400 for invalid storageConfig', async () => {
    const res = await bulkPost(
      makeRequest('/api/dashboard/views/bulk', {
        method: 'POST',
        body: {
          views: [{ name: 'A', connectionRef: 'c1', data: 'raw' }],
          storageConfig: { provider: 'mongodb' },
        },
      }),
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toMatch(/Invalid storageConfig/);
    expect(mockDb().dashboardView.upsert).not.toHaveBeenCalled();
  });

  it('PATCH /api/dashboard/views/[id] returns 400 for invalid storageConfig', async () => {
    const res = await PATCH(
      makeRequest('/api/dashboard/views/v1', {
        method: 'PATCH',
        body: { name: 'X', storageConfig: { provider: 'mongodb' } },
      }),
      ctxV1() as any,
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toMatch(/Invalid storageConfig/);
  });

  it('DELETE /api/dashboard/views/[id] returns 400 for invalid storageConfig', async () => {
    const res = await DELETE(
      makeRequest('/api/dashboard/views/v1', {
        method: 'DELETE',
        body: { storageConfig: { provider: 'mongodb' } },
      }),
      ctxV1() as any,
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toMatch(/Invalid storageConfig/);
    expect(mockDb().dashboardView.delete).not.toHaveBeenCalled();
  });

  it('POST /api/dashboard/views/[id]/default returns 400 for invalid storageConfig', async () => {
    const res = await setDefault(
      makeRequest('/api/dashboard/views/v1/default', {
        method: 'POST',
        body: { storageConfig: { provider: 'mongodb' } },
      }),
      ctxV1() as any,
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toMatch(/Invalid storageConfig/);
  });

  it('DELETE /api/dashboard/views/[id]/default returns 400 for invalid storageConfig', async () => {
    const res = await clearDefault(
      makeRequest('/api/dashboard/views/v1/default', {
        method: 'DELETE',
        body: { storageConfig: { provider: 'mongodb' } },
      }),
      ctxV1() as any,
    );
    expect(res.status).toBe(400);
    expect((await readJson(res)).error).toMatch(/Invalid storageConfig/);
  });
});

// ─── Bulk import idempotency ─────────────────────────────────────────────────

describe('POST /api/dashboard/views/bulk idempotency', () => {
  const viewWithoutId = { name: 'B', connectionRef: 'c1', data: 'raw' };

  it('generates a stable id for views lacking one (same payload -> same id)', async () => {
    const payload = { views: [viewWithoutId], storageConfig: STORAGE_CONFIG };

    await bulkPost(
      makeRequest('/api/dashboard/views/bulk', { method: 'POST', body: payload }),
    );
    await bulkPost(
      makeRequest('/api/dashboard/views/bulk', { method: 'POST', body: payload }),
    );

    const calls = mockDb().dashboardView.upsert.mock.calls;
    expect(calls).toHaveLength(2);
    const firstId = calls[0][0].where.id;
    const secondId = calls[1][0].where.id;
    // Deterministic (not random), so re-import upserts instead of duplicating.
    expect(firstId).toMatch(/^view-[0-9a-f]{64}$/);
    expect(secondId).toBe(firstId);
  });

  it('derives different stable ids for different views', async () => {
    const res = await bulkPost(
      makeRequest('/api/dashboard/views/bulk', {
        method: 'POST',
        body: {
          views: [
            viewWithoutId,
            { name: 'C', connectionRef: 'c1', data: 'raw' },
          ],
          storageConfig: STORAGE_CONFIG,
        },
      }),
    );
    expect(res.status).toBe(200);
    const calls = mockDb().dashboardView.upsert.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0].where.id).not.toBe(calls[1][0].where.id);
  });

  it('preserves explicit ids when provided', async () => {
    await bulkPost(
      makeRequest('/api/dashboard/views/bulk', {
        method: 'POST',
        body: {
          views: [{ id: 'explicit-1', name: 'A', connectionRef: 'c1', data: 'x' }],
          storageConfig: STORAGE_CONFIG,
        },
      }),
    );
    const calls = mockDb().dashboardView.upsert.mock.calls;
    expect(calls[0][0].where.id).toBe('explicit-1');
  });
});
