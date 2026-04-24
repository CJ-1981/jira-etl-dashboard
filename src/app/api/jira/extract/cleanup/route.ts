import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { retentionDays, beforeDate, cleanupOrphaned } = await request.json();

    // Handle orphaned data cleanup
    if (cleanupOrphaned) {
      // Get active connection IDs
      const activeConnections = await db.jiraConnection.findMany({
        where: { isActive: true },
        select: { id: true }
      });

      const activeConnectionIds = activeConnections.map(c => c.id);

      // Find orphaned runs (from deleted connections)
      const orphanedRuns = await (db as any).etlRun.findMany({
        where: {
          connectionId: { notIn: activeConnectionIds }
        },
        select: {
          id: true,
          sizeBytes: true
        }
      });

      const orphanedRunIds = orphanedRuns.map((r: any) => r.id);
      const freedSpaceBytes = orphanedRuns.reduce((sum: number, r: any) => sum + (r.sizeBytes || 0), 0);

      if (orphanedRunIds.length > 0) {
        // Delete KPI results
        await (db as any).kpiResult.deleteMany({
          where: {
            etlRunId: { in: orphanedRunIds }
          }
        });

        // Delete transitions
        const snapshotIds = await (db as any).ticketSnapshot.findMany({
          where: {
            etlRunId: { in: orphanedRunIds }
          },
          select: { id: true }
        });

        if (snapshotIds.length > 0) {
          await (db as any).ticketTransition.deleteMany({
            where: {
              ticketSnapshotId: { in: snapshotIds.map((s: any) => s.id) }
            }
          });
        }

        // Delete snapshots
        await (db as any).ticketSnapshot.deleteMany({
          where: {
            etlRunId: { in: orphanedRunIds }
          }
        });

        // Delete runs
        await (db as any).etlRun.deleteMany({
          where: {
            id: { in: orphanedRunIds }
          }
        });
      }

      return NextResponse.json({
        success: true,
        deleted: {
          etlRuns: orphanedRunIds.length,
          freedSpaceMB: freedSpaceBytes / (1024 * 1024)
        }
      });
    }

    // Handle retention-based cleanup
    let cutoffDate: Date;

    if (beforeDate) {
      cutoffDate = new Date(beforeDate);
    } else if (retentionDays && retentionDays !== 'never') {
      cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - Number(retentionDays));
    } else {
      return NextResponse.json({ success: false, error: 'Invalid cleanup parameters' }, { status: 400 });
    }

    // Find runs to delete
    const runsToDelete = await db.etlRun.findMany({
      where: {
        completedAt: {
          lt: cutoffDate
        }
      },
      select: {
        id: true,
        sizeBytes: true
      }
    });

    const etlRunIds = runsToDelete.map(r => r.id);
    const freedSpaceBytes = runsToDelete.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);

    if (etlRunIds.length > 0) {
      // Cascade delete is handled by schema in many DBs,
      // but for SQLite/Prisma we might need to be explicit if not defined.
      // In our schema, we don't have onDelete: Cascade explicitly in all places,
      // but TicketSnapshot references EtlRun.

      // First delete transitions
      await db.ticketTransition.deleteMany({
        where: {
          ticket: {
            etlRunId: {
              in: etlRunIds
            }
          }
        }
      });

      // Then snapshots
      await db.ticketSnapshot.deleteMany({
        where: {
          etlRunId: {
            in: etlRunIds
          }
        }
      });

      // Finally the runs
      await db.etlRun.deleteMany({
        where: {
          id: {
            in: etlRunIds
          }
        }
      });
    }

    return NextResponse.json({
      success: true,
      deleted: {
        etlRuns: etlRunIds.length,
        freedSpaceMB: freedSpaceBytes / (1024 * 1024)
      }
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json({ success: false, error: 'Failed to cleanup data' }, { status: 500 });
  }
}
