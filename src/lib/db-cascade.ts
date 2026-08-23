/**
 * FK-safe cascade deletion helpers shared by the Jira API routes.
 *
 * Centralizes the per-connection deletion sequence
 * (kpiResult → dashboardView → ticketTransition → ticketSnapshot → etlRun →
 * masterTicket) that used to be copy-pasted — with inconsistent atomicity —
 * across multiple route handlers.
 *
 * The module is typed against minimal structural types (TxLike/DbLike) so it
 * works with any Prisma client flavor (SQLite/PostgreSQL) and with test
 * mocks, without importing Prisma itself. lib/db's structural DbClient
 * satisfies DbLike directly, so routes pass their client without casts.
 */

/** Batch mutation result (the shape Prisma's deleteMany resolves to). */
export interface BatchDeleteResult {
  count: number;
}

/** A row projected to its id (findMany with select: { id: true }). */
export interface IdRow {
  id: string;
}

/**
 * Minimal structural model delegate — the slice of a Prisma model API the
 * cascade needs (id-projecting reads and batch deletes). Returns are the
 * loose unknown shapes of lib/db's PrismaModelDelegate so that DbClient is
 * directly assignable; the cascade narrows results locally where it reads
 * `.id` / `.count`.
 */
export interface CascadeModelDelegate {
  findMany(args: {
    where?: Record<string, unknown>;
    select?: Record<string, unknown>;
  }): Promise<unknown[]>;
  deleteMany(args: { where: Record<string, unknown> }): Promise<unknown>;
}

/**
 * A transaction handle (or client) exposing the models the cascade touches.
 * Prisma interactive-transaction clients satisfy this structurally.
 *
 * Kept as a narrow structural type (rather than lib/db's DbClient) so that
 * minimal test doubles and transaction handles that only carry the six
 * cascade models remain assignable; lib/db's DbClient is assignable too,
 * because CascadeModelDelegate mirrors PrismaModelDelegate's loose returns.
 */
export interface TxLike {
  kpiResult: CascadeModelDelegate;
  dashboardView: CascadeModelDelegate;
  ticketTransition: CascadeModelDelegate;
  ticketSnapshot: CascadeModelDelegate;
  etlRun: CascadeModelDelegate;
  masterTicket: CascadeModelDelegate;
}

/**
 * A client that can run the cascade. lib/db's DbClient satisfies this
 * directly (its $transaction callback yields a DbClient, which carries every
 * TxLike model), so routes can pass their DbClient without bridging casts.
 */
export interface DbLike {
  kpiResult: CascadeModelDelegate;
  dashboardView: CascadeModelDelegate;
  ticketTransition: CascadeModelDelegate;
  ticketSnapshot: CascadeModelDelegate;
  etlRun: CascadeModelDelegate;
  masterTicket: CascadeModelDelegate;
  $transaction<T>(fn: (tx: TxLike) => Promise<T>): Promise<T>;
}

/**
 * Deletes a set of ETL runs together with all dependent rows in FK-safe
 * order: kpiResult → ticketTransition → ticketSnapshot → etlRun.
 *
 * Pass a transaction handle as `tx` so the cascade commits atomically.
 *
 * @returns total number of deleted rows across the four tables.
 */
export async function deleteEtlRunsWithChildren(
  tx: TxLike,
  etlRunIds: string[]
): Promise<number> {
  if (etlRunIds.length === 0) return 0;

  let deletedCount = 0;

  // 1. KPI results referencing the runs
  const kpiResults = await tx.kpiResult.deleteMany({
    where: { etlRunId: { in: etlRunIds } },
  });
  deletedCount += (kpiResults as BatchDeleteResult).count;

  // 2. Ticket transitions (reference ticketSnapshotId) — resolve ids first
  const snapshots = await tx.ticketSnapshot.findMany({
    where: { etlRunId: { in: etlRunIds } },
    select: { id: true },
  });
  if (snapshots.length > 0) {
    const transitions = await tx.ticketTransition.deleteMany({
      where: { ticketSnapshotId: { in: (snapshots as IdRow[]).map((s) => s.id) } },
    });
    deletedCount += (transitions as BatchDeleteResult).count;
  }

  // 3. Ticket snapshots (reference etlRunId)
  const deletedSnapshots = await tx.ticketSnapshot.deleteMany({
    where: { etlRunId: { in: etlRunIds } },
  });
  deletedCount += (deletedSnapshots as BatchDeleteResult).count;

  // 4. The ETL runs themselves
  const runs = await tx.etlRun.deleteMany({
    where: { id: { in: etlRunIds } },
  });
  deletedCount += (runs as BatchDeleteResult).count;

  return deletedCount;
}

/** Aggregate deletion counts for a full per-connection cascade. */
export interface ConnectionDeletionResult {
  /** Number of ETL runs removed for the connection. */
  runCount: number;
  /** Number of master tickets removed for the connection. */
  masterTicketCount: number;
  /** Total rows deleted across every table in the cascade. */
  deletedCount: number;
}

/**
 * Deletes all data belonging to a connection in a single transaction, using
 * the FK-safe order:
 *
 *   kpiResult → dashboardView → ticketTransition → ticketSnapshot → etlRun
 *   → masterTicket
 *
 * kpiResult and dashboardView are deleted by connectionRef (covering rows
 * whose etlRunId is NULL), and masterTicket is deleted last.
 *
 * @returns aggregate counts for building user-facing responses.
 */
export async function deleteConnectionData(
  db: DbLike,
  connectionRef: string
): Promise<ConnectionDeletionResult> {
  return db.$transaction(async (tx) => {
    // Gather all ETL runs for this connection so child records can be
    // cascade-deleted in the correct (FK-safe) order.
    const etlRuns = await tx.etlRun.findMany({
      where: { connectionRef },
      select: { id: true },
    });
    const etlRunIds = (etlRuns as IdRow[]).map((r) => r.id);

    let deletedCount = 0;

    // 1. KPI results — deleted by connectionRef, which covers both results
    //    linked to an ETL run and orphaned rows whose etlRunId is NULL.
    const kpiResults = await tx.kpiResult.deleteMany({
      where: { connectionRef },
    });
    deletedCount += (kpiResults as BatchDeleteResult).count;

    // 2. Dashboard views (reference connectionRef)
    const dashboardViews = await tx.dashboardView.deleteMany({
      where: { connectionRef },
    });
    deletedCount += (dashboardViews as BatchDeleteResult).count;

    // 3-5. Run-scoped cascade (transitions → snapshots → runs)
    deletedCount += await deleteEtlRunsWithChildren(tx, etlRunIds);

    // 6. Master tickets (reference connectionRef directly)
    const masterTickets = await tx.masterTicket.deleteMany({
      where: { connectionRef },
    });
    deletedCount += (masterTickets as BatchDeleteResult).count;

    return {
      runCount: etlRunIds.length,
      masterTicketCount: (masterTickets as BatchDeleteResult).count,
      deletedCount,
    };
  });
}
