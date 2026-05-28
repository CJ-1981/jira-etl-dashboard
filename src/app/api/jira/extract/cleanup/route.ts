import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { retentionDays, beforeDate, storageConfig } = await request.json();
    const db = getDb(storageConfig);

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
    const runsToDelete = await (db as any).etlRun.findMany({
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

    const etlRunIds = runsToDelete.map((r: any) => r.id);
    const freedSpaceBytes = runsToDelete.reduce((sum: number, r: any) => sum + (r.sizeBytes || 0), 0);

    if (etlRunIds.length > 0) {
      // Delete associated data
      await (db as any).kpiResult.deleteMany({
        where: { etlRunId: { in: etlRunIds } }
      });

      const snapshotIds = await (db as any).ticketSnapshot.findMany({
        where: { etlRunId: { in: etlRunIds } },
        select: { id: true }
      });

      if (snapshotIds.length > 0) {
        await (db as any).ticketTransition.deleteMany({
          where: { ticketSnapshotId: { in: snapshotIds.map((s: any) => s.id) } }
        });
      }

      await (db as any).ticketSnapshot.deleteMany({
        where: { etlRunId: { in: etlRunIds } }
      });

      await (db as any).etlRun.deleteMany({
        where: { id: { in: etlRunIds } }
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
