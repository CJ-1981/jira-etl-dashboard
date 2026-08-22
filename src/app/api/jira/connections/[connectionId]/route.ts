/**
 * DELETE /api/jira/connections/[connectionId]
 *
 * Removes all extraction data (ETL runs, ticket snapshots, transitions, KPI
 * results, dashboard views, master tickets) for a connection from the
 * database. The caller (ConnectionsPanel) is responsible for deleting the
 * browser-side connection configuration from localStorage once this endpoint
 * reports success.
 *
 * ConnectionsPanel sends a bare DELETE with no body, so this defaults to the
 * app's primary database. An optional { storageConfig } JSON body is honored
 * when present, so callers targeting an alternate (e.g. PostgreSQL) backend
 * are also supported.
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isLoopbackOriginRequest } from '@/lib/security';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    const { connectionId } = await params;

    // The component sends no body; fall back to the default DB in that case.
    let storageConfig: unknown;
    try {
      const body = await request.json();
      storageConfig = body?.storageConfig;
    } catch {
      // Empty/non-JSON body — use the default database.
    }

    const db = getDb(storageConfig as Parameters<typeof getDb>[0]);

    // Run the whole cascade in a single transaction so a failure mid-way
    // cannot leave the connection's data half-deleted.
    const result = await (db as any).$transaction(async (tx: any) => {
      // Gather all ETL runs for this connection so child records can be
      // cascade-deleted in the correct (FK-safe) order.
      const etlRuns = await tx.etlRun.findMany({
        where: { connectionRef: connectionId },
        select: { id: true },
      });
      const etlRunIds = etlRuns.map((r: any) => r.id);

      let deletedCount = 0;

      // 1. KPI results — deleted by connectionRef, which covers both results
      //    linked to an ETL run and orphaned rows whose etlRunId is NULL.
      const kpiResults = await tx.kpiResult.deleteMany({
        where: { connectionRef: connectionId },
      });
      deletedCount += kpiResults.count;

      // 2. Dashboard views (reference connectionRef)
      const dashboardViews = await tx.dashboardView.deleteMany({
        where: { connectionRef: connectionId },
      });
      deletedCount += dashboardViews.count;

      if (etlRunIds.length > 0) {
        // 3. Ticket transitions (reference ticketSnapshotId) — resolve ids first
        const snapshots = await tx.ticketSnapshot.findMany({
          where: { etlRunId: { in: etlRunIds } },
          select: { id: true },
        });
        if (snapshots.length > 0) {
          const transitions = await tx.ticketTransition.deleteMany({
            where: { ticketSnapshotId: { in: snapshots.map((s: any) => s.id) } },
          });
          deletedCount += transitions.count;
        }

        // 4. Ticket snapshots (reference etlRunId)
        const deletedSnapshots = await tx.ticketSnapshot.deleteMany({
          where: { etlRunId: { in: etlRunIds } },
        });
        deletedCount += deletedSnapshots.count;

        // 5. ETL runs themselves
        const runs = await tx.etlRun.deleteMany({
          where: { id: { in: etlRunIds } },
        });
        deletedCount += runs.count;
      }

      // 6. Master tickets (reference connectionRef directly)
      const masterTickets = await tx.masterTicket.deleteMany({
        where: { connectionRef: connectionId },
      });
      deletedCount += masterTickets.count;

      return {
        runCount: etlRunIds.length,
        masterTicketCount: masterTickets.count,
        deletedCount,
      };
    });

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.runCount} extractions and ${result.masterTicketCount} master tickets (${result.deletedCount} records).`,
    });
  } catch (error) {
    console.error('[Connections DELETE] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete connection data' },
      { status: 500 }
    );
  }
}
