import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Get only active connections to filter out orphaned data
    const activeConnections = await db.jiraConnection.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
      },
    });

    const activeConnectionIds = activeConnections.map(c => c.id);

    const totalExtractions = await (db as any).etlRun.count({
      where: {
        autoSave: true,
        connectionId: { in: activeConnectionIds }
      }
    });

    const sizeResult = await (db as any).etlRun.aggregate({
      where: {
        autoSave: true,
        connectionId: { in: activeConnectionIds }
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
      activeConnections.map(async (connection) => {
        const runs = await (db as any).etlRun.findMany({
          where: {
            connectionId: connection.id,
            autoSave: true,
          },
          select: {
            sizeBytes: true,
            completedAt: true,
            ticketsProcessed: true,
          },
        });

        const totalSize = runs.reduce((sum, run) => sum + (run.sizeBytes || 0), 0);
        const totalTickets = runs.reduce((sum, run) => sum + run.ticketsProcessed, 0);

        return {
          connectionId: connection.id,
          connectionName: connection.name,
          extractions: runs.length,
          totalSizeMB: totalSize / (1024 * 1024),
          totalTickets,
          oldestExtraction: runs.length > 0 ? runs[runs.length - 1].completedAt : null,
          newestExtraction: runs.length > 0 ? runs[0].completedAt : null,
        };
      })
    );

    // Sort by size (largest first)
    connectionStats.sort((a, b) => b.totalSizeMB - a.totalSizeMB);

    // Count orphaned records (from deleted connections)
    const orphanedCount = await (db as any).etlRun.count({
      where: {
        autoSave: true,
        connectionId: { notIn: activeConnectionIds }
      }
    });

    return NextResponse.json({
      success: true,
      storage: {
        totalExtractions,
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
