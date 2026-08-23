import { describe, it, expect } from 'vitest';
import { buildPgUrl } from '@/lib/db';
import type { DbClient, PrismaModelDelegate } from '@/lib/db';
import { createMockDb } from '@/test/mock-db';

/**
 * Guards the structural DbClient surface introduced in the type-safety
 * refactor: buildPgUrl edge cases plus runtime evidence that the mock db
 * satisfies the structural model-access shape.
 */
describe('buildPgUrl', () => {
  it('builds a standard URL with the default sslmode', () => {
    expect(
      buildPgUrl({ host: 'localhost', port: 5432, database: 'postgres', username: 'user', password: 'pass' }),
    ).toBe('postgresql://user:pass@localhost:5432/postgres?sslmode=prefer');
  });

  it('omits the password segment when no password is given', () => {
    expect(buildPgUrl({ host: 'h', port: 5433, database: 'd', username: 'u' })).toBe(
      'postgresql://u@h:5433/d?sslmode=prefer',
    );
  });

  it('percent-encodes special characters in username and password', () => {
    expect(
      buildPgUrl({ host: 'h', port: 5432, database: 'd', username: 'u@x', password: 'p@ss:w/rd' }),
    ).toBe('postgresql://u%40x:p%40ss%3Aw%2Frd@h:5432/d?sslmode=prefer');
  });

  it('honors an explicit sslMode', () => {
    expect(buildPgUrl({ host: 'h', port: 5432, database: 'd', username: 'u', sslMode: 'require' })).toBe(
      'postgresql://u@h:5432/d?sslmode=require',
    );
  });
});

describe('structural DbClient', () => {
  // A typed helper proves model access goes through the structural type
  // (this file would fail type-check if DbClient collapsed back to `any`
  // consumers or lost its model members).
  const countAll = async (model: PrismaModelDelegate): Promise<number> => model.count();

  it('exposes typed model delegates usable against the mock db', async () => {
    // MockDb is Record<string, Record<string, vi.fn>>; it satisfies the
    // surface at runtime but not nominally (the $-helpers are bags, not
    // functions), so a boundary cast mirrors what db.ts does for the real
    // clients.
    const db = createMockDb() as unknown as DbClient;

    await expect(db.etlRun.findMany({ where: { status: 'completed' } })).resolves.toEqual([]);
    await expect(countAll(db.masterTicket)).resolves.toBe(0);
    await expect(db.kpiResult.deleteMany({ where: {} })).resolves.toEqual({ count: 0 });
  });

  it('types the interactive $transaction callback as DbClient', async () => {
    const db = createMockDb() as unknown as DbClient;
    const result = await db.$transaction(async (tx: DbClient) => {
      await tx.dashboardView.updateMany({ where: {}, data: {} });
      return tx.dashboardView.findMany({});
    });
    expect(result).toEqual([]);
  });
});
