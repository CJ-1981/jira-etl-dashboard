import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { activeConnections, storageConfig } = await request.json();
    const db = getDb(storageConfig);
    
    if (!activeConnections || !Array.isArray(activeConnections)) {
      return NextResponse.json({ success: false, error: 'activeConnections array is required' }, { status: 400 });
    }

    const activeConnectionRefs = activeConnections.map((c: any) => c.id);

    // Get overall stats
    const totalMasterTickets = await (db as any).masterTicket.count({
      where: { connectionRef: { in: activeConnectionRefs } }
    });

    const totalExtractions = await (db as any).etlRun.count({
      where: {
        autoSave: true,
        connectionRef: { in: activeConnectionRefs }
      }
    });

    const sizeResult = await (db as any).etlRun.aggregate({
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
    }) as any;

    // Get breakdown by connection
    const connectionStats = await Promise.all(
      activeConnections.map(async (connection: any) => {
        const runs = await (db as any).etlRun.findMany({
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
        });

        const totalSize = runs.reduce((sum: number, run: any) => sum + (run.sizeBytes || 0), 0);
        const masterTicketCount = await (db as any).masterTicket.count({
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
    const orphanedCount = await (db as any).etlRun.count({
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
    console.error('Storage info error:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve storage info' }, { status: 500 });
  }
}

// Keep GET for basic health check, but requires POST for full stats now
export async function GET() {
  return NextResponse.json({ success: false, error: 'Use POST with activeConnections to get full stats' }, { status: 405 });
}
