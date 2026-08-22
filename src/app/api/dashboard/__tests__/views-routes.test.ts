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
