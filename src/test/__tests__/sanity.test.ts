import { describe, it, expect } from 'vitest';
import { createMockDb, makeRequest } from '@/test/mock-db';
import { createMockStore, createMockLocalConfig } from '@/test/mock-store';

describe('infra sanity', () => {
  it('mock-db returns memoized smart-default fns and allows overrides', async () => {
    const db = createMockDb() as any;
    expect(await db.etlRun.findMany({})).toEqual([]);
    expect(await db.etlRun.count({})).toBe(0);
    expect(await db.masterTicket.deleteMany({})).toEqual({ count: 0 });
    expect(await db.etlRun.aggregate({})).toEqual({ _sum: {}, _min: {}, _max: {} });
    db.etlRun.findMany.mockResolvedValue([{ id: 'x' }]);
    expect(await db.etlRun.findMany({})).toEqual([{ id: 'x' }]);
    expect(await db.$queryRaw`SELECT 1`).toEqual([{ '?column?': 1 }]);
  });

  it('makeRequest + readJson round-trip', async () => {
    const r = makeRequest('/x', { method: 'POST', body: { a: 1 } });
    expect(r.method).toBe('POST');
    expect(await r.json()).toEqual({ a: 1 });
  });

  it('mock-store has mutating setters', () => {
    const store = createMockStore({ activeConnectionId: 'c1' }) as any;
    expect(store.activeConnectionId).toBe('c1');
    store.setActiveConnectionId('c2');
    expect(store.activeConnectionId).toBe('c2');
    expect(store.setActiveConnectionId).toHaveBeenCalled();
  });

  it('mock-localConfig has vi.fn methods', () => {
    const lc = createMockLocalConfig();
    expect(lc.getJiraConnections()).toEqual([]);
    expect(lc.getStorageConfig()).toEqual({ provider: 'sqlite', url: '', isCustom: false });
  });
});
