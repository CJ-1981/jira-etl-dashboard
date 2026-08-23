import { describe, it, expect } from 'vitest';
import { createMockDb } from '@/test/mock-db';
import {
  deleteConnectionData,
  deleteEtlRunsWithChildren,
  type DbLike,
  type TxLike,
} from '../db-cascade';

/** The mock DB is a dynamic proxy; cast once at the boundary. */
const asDb = (db: ReturnType<typeof createMockDb>) => db as unknown as DbLike;

describe('deleteEtlRunsWithChildren', () => {
  it('deletes children before parents (FK-safe order) and aggregates counts', async () => {
    const db = createMockDb();
    db.ticketSnapshot.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    db.kpiResult.deleteMany.mockResolvedValue({ count: 3 });
    db.ticketTransition.deleteMany.mockResolvedValue({ count: 5 });
    db.ticketSnapshot.deleteMany.mockResolvedValue({ count: 2 });
    db.etlRun.deleteMany.mockResolvedValue({ count: 2 });

    const total = await deleteEtlRunsWithChildren(asDb(db), ['r1', 'r2']);

    expect(total).toBe(12);
    // Transitions are scoped to the resolved snapshot ids.
    expect(db.ticketTransition.deleteMany).toHaveBeenCalledWith({
      where: { ticketSnapshotId: { in: ['s1', 's2'] } },
    });
    // Snapshots and runs are scoped to the given run ids.
    expect(db.ticketSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { etlRunId: { in: ['r1', 'r2'] } },
    });
    expect(db.etlRun.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['r1', 'r2'] } },
    });
    // FK-safe order: kpiResult → transitions → snapshots → runs
    const ordered = [
      db.kpiResult.deleteMany,
      db.ticketTransition.deleteMany,
      db.ticketSnapshot.deleteMany,
      db.etlRun.deleteMany,
    ];
    const invocations = ordered.map((fn) => fn.mock.invocationCallOrder[0]);
    for (let i = 0; i < invocations.length - 1; i++) {
      expect(invocations[i]).toBeLessThan(invocations[i + 1]);
    }
  });

  it('skips the transition delete when the runs have no snapshots', async () => {
    const db = createMockDb();
    // ticketSnapshot.findMany defaults to []
    const total = await deleteEtlRunsWithChildren(asDb(db), ['r1']);

    expect(db.ticketTransition.deleteMany).not.toHaveBeenCalled();
    // kpiResults(0) + snapshots(0) + runs(0) with default mock counts
    expect(total).toBe(0);
    expect(db.etlRun.deleteMany).toHaveBeenCalled();
  });

  it('returns 0 and issues no queries for an empty run-id list', async () => {
    const db = createMockDb();
    const total = await deleteEtlRunsWithChildren(asDb(db), []);

    expect(total).toBe(0);
    expect(db.kpiResult.deleteMany).not.toHaveBeenCalled();
    expect(db.ticketSnapshot.findMany).not.toHaveBeenCalled();
    expect(db.ticketSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(db.etlRun.deleteMany).not.toHaveBeenCalled();
  });
});

describe('deleteConnectionData', () => {
  it('runs the cascade inside db.$transaction with the tx handle', async () => {
    const db = createMockDb();
    db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);

    await deleteConnectionData(asDb(db), 'c1');

    expect(db.$transaction).toHaveBeenCalledTimes(1);
    // The transaction callback received a usable handle: all deletes ran.
    expect(db.etlRun.findMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1' },
      select: { id: true },
    });
    expect(db.kpiResult.deleteMany).toHaveBeenCalled();
    expect(db.masterTicket.deleteMany).toHaveBeenCalled();
  });

  it('deletes in FK-safe order: kpiResult, dashboardView, transitions, snapshots, runs, masterTicket last', async () => {
    const db = createMockDb();
    db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);
    db.ticketSnapshot.findMany.mockResolvedValue([{ id: 's1' }]);

    await deleteConnectionData(asDb(db), 'c1');

    const ordered = [
      db.kpiResult.deleteMany,
      db.dashboardView.deleteMany,
      db.ticketTransition.deleteMany,
      db.ticketSnapshot.deleteMany,
      db.etlRun.deleteMany,
      db.masterTicket.deleteMany,
    ];
    ordered.forEach((fn) => expect(fn).toHaveBeenCalled());
    const invocations = ordered.map((fn) => fn.mock.invocationCallOrder[0]);
    for (let i = 0; i < invocations.length - 1; i++) {
      expect(invocations[i]).toBeLessThan(invocations[i + 1]);
    }
  });

  it('deletes kpiResult and dashboardView by connectionRef', async () => {
    const db = createMockDb();

    await deleteConnectionData(asDb(db), 'c1');

    expect(db.kpiResult.deleteMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1' },
    });
    expect(db.dashboardView.deleteMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1' },
    });
    expect(db.masterTicket.deleteMany).toHaveBeenCalledWith({
      where: { connectionRef: 'c1' },
    });
  });

  it('aggregates counts across every delete, including master tickets', async () => {
    const db = createMockDb();
    db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
    db.ticketSnapshot.findMany.mockResolvedValue([{ id: 's1' }]);
    // kpiResult is targeted twice: first by connectionRef (removes every row,
    // including run-linked ones), then by etlRunId inside the run-scoped
    // cascade — a no-op in production because the rows are already gone.
    // Model that here so the aggregated count matches real behavior.
    db.kpiResult.deleteMany.mockImplementation(
      async (args: { where: Record<string, unknown> }) =>
        'connectionRef' in args.where ? { count: 3 } : { count: 0 }
    );
    db.dashboardView.deleteMany.mockResolvedValue({ count: 4 });
    db.ticketTransition.deleteMany.mockResolvedValue({ count: 5 });
    db.ticketSnapshot.deleteMany.mockResolvedValue({ count: 6 });
    db.etlRun.deleteMany.mockResolvedValue({ count: 2 });
    db.masterTicket.deleteMany.mockResolvedValue({ count: 7 });

    const result = await deleteConnectionData(asDb(db), 'c1');

    expect(result).toEqual({
      runCount: 2,
      masterTicketCount: 7,
      deletedCount: 27,
    });
  });

  it('still deletes connection-scoped rows when the connection has no runs', async () => {
    const db = createMockDb();
    // etlRun.findMany defaults to []
    db.kpiResult.deleteMany.mockResolvedValue({ count: 1 });
    db.dashboardView.deleteMany.mockResolvedValue({ count: 2 });
    db.masterTicket.deleteMany.mockResolvedValue({ count: 3 });

    const result = await deleteConnectionData(asDb(db), 'c1');

    expect(result).toEqual({
      runCount: 0,
      masterTicketCount: 3,
      deletedCount: 6,
    });
    // run-scoped cascade skipped entirely
    expect(db.ticketTransition.deleteMany).not.toHaveBeenCalled();
    expect(db.ticketSnapshot.deleteMany).not.toHaveBeenCalled();
    expect(db.etlRun.deleteMany).not.toHaveBeenCalled();
    // connection-scoped deletes still ran
    expect(db.kpiResult.deleteMany).toHaveBeenCalled();
    expect(db.dashboardView.deleteMany).toHaveBeenCalled();
    expect(db.masterTicket.deleteMany).toHaveBeenCalled();
  });

  it('passes the transaction handle to deleteEtlRunsWithChildren (tx wiring)', async () => {
    const db = createMockDb();
    db.etlRun.findMany.mockResolvedValue([{ id: 'r1' }]);

    await deleteConnectionData(asDb(db), 'c1');

    // The run-scoped child deletion used the tx handle: snapshot ids were
    // resolved and the transition delete was issued in the same call chain.
    expect(db.ticketSnapshot.findMany).toHaveBeenCalledWith({
      where: { etlRunId: { in: ['r1'] } },
      select: { id: true },
    });
  });

  it('propagates errors thrown inside the transaction', async () => {
    const db = createMockDb();
    // MockDb's index-signature typing hides the $transaction mock; reach it
    // through the DbLike view, which knows it is a function.
    const txMock = asDb(db).$transaction as unknown as {
      mockRejectedValue(err: unknown): void;
    };
    txMock.mockRejectedValue(new Error('boom'));

    await expect(deleteConnectionData(asDb(db), 'c1')).rejects.toThrow('boom');
  });
});

// Compile-time check: a TxLike handle is accepted by deleteEtlRunsWithChildren.
// (Never executed — purely a structural-type smoke guard.)
describe('structural typing', () => {
  it('accepts a minimal TxLike implementation', async () => {
    const calls: string[] = [];
    const model = (name: string) => ({
      findMany: async () => {
        calls.push(`${name}.findMany`);
        return [];
      },
      deleteMany: async () => {
        calls.push(`${name}.deleteMany`);
        return { count: 1 };
      },
    });
    const tx: TxLike = {
      kpiResult: model('kpiResult'),
      dashboardView: model('dashboardView'),
      ticketTransition: model('ticketTransition'),
      ticketSnapshot: model('ticketSnapshot'),
      etlRun: model('etlRun'),
      masterTicket: model('masterTicket'),
    };
    const total = await deleteEtlRunsWithChildren(tx, ['r1']);
    expect(total).toBe(3); // kpiResult + snapshots + runs (no transitions)
    expect(calls).toEqual([
      'kpiResult.deleteMany',
      'ticketSnapshot.findMany',
      'ticketSnapshot.deleteMany',
      'etlRun.deleteMany',
    ]);
  });
});
