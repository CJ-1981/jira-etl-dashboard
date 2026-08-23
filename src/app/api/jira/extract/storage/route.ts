import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';

/** Shape of the etlRun aggregate result this handler reads. */
interface EtlRunSizeAggregate {
  _sum: { sizeBytes: number | null };
  _min: { completedAt: string | null };
  _max: { completedAt: string | null };
}

/** Narrow slice of an EtlRun row — only the fields the per-connection read uses. */
interface EtlRunSizeRow {
  sizeBytes: number | null;
  completedAt: string | null;
}

export async function POST(request: Request) {
  try {
    // The body can be absent on the first request to a freshly-compiled dev
    // route (Next.js holds the request during compile and the body stream is
    // lost). Degrade to empty stats instead of crashing so the panel doesn't
    // surface a spurious "Failed to retrieve storage info" toast.
    let body: { activeConnections?: unknown[]; storageConfig?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      // Empty/unparseable body — fall through with empty defaults below.
    }
    const activeConnections = Array.isArray(body.activeConnections)
      ? body.activeConnections
      : [];
    const storageConfig = body.storageConfig;
    const db = getDb(storageConfig as Parameters<typeof getDb>[0]);

    const activeConnectionRefs = activeConnections.map((c: any) => c.id);

    // Get overall stats
    const totalMasterTickets = await db.masterTicket.count({
      where: { connectionRef: { in: activeConnectionRefs } }
    });

    const totalExtractions = await db.etlRun.count({
      where: {
        autoSave: true,
        connectionRef: { in: activeConnectionRefs }
      }
    });

    const sizeResult = await db.etlRun.aggregate({
      where: {
        autoSave: true,
        connectionRef: { in: activeConnectionRefs }
      },
      _sum: {
        sizeBytes: true
      },
      _min: {
        completedAt: true
      },
      _max: {
        completedAt: true
      }
    }) as EtlRunSizeAggregate;

    // Get breakdown by connection
    const connectionStats = await Promise.all(
      activeConnections.map(async (connection: any) => {
        const runs = await db.etlRun.findMany({
          where: {
            connectionRef: connection.id,
            autoSave: true,
          },
          orderBy: { completedAt: 'desc' },
          select: {
            sizeBytes: true,
            completedAt: true,
            ticketsProcessed: true,
          },
        }) as EtlRunSizeRow[];

        const totalSize = runs.reduce((sum: number, run: any) => sum + (run.sizeBytes || 0), 0);
        const masterTicketCount = await db.masterTicket.count({
          where: { connectionRef: connection.id }
        });

        return {
          connectionId: connection.id,
          connectionName: connection.name,
          extractions: runs.length,
          totalSizeMB: totalSize / (1024 * 1024),
          totalTickets: masterTicketCount,
          oldestExtraction: runs.length > 0 ? runs[runs.length - 1].completedAt : null,
          newestExtraction: runs.length > 0 ? runs[0].completedAt : null,
        };
      })
    );

    connectionStats.sort((a, b) => b.totalSizeMB - a.totalSizeMB);

    // Orphaned records (not in currently active frontend list)
    const orphanedCount = await db.etlRun.count({
      where: {
        autoSave: true,
        connectionRef: { notIn: activeConnectionRefs }
      }
    });

    return NextResponse.json({
      success: true,
      storage: {
        totalExtractions,
        totalTickets: totalMasterTickets,
        totalSizeMB: (sizeResult._sum.sizeBytes || 0) / (1024 * 1024),
        oldestExtraction: sizeResult._min.completedAt,
        newestExtraction: sizeResult._max.completedAt,
        byConnection: connectionStats,
        orphanedExtractions: orphanedCount,
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}

// Keep GET for basic health check, but requires POST for full stats now
export async function GET() {
  return NextResponse.json({ success: false, error: 'Use POST with activeConnections to get full stats' }, { status: 405 });
}
