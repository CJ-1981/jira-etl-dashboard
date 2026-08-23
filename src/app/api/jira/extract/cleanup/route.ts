import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isLoopbackOriginRequest } from '@/lib/security';
import { deleteEtlRunsWithChildren } from '@/lib/db-cascade';

export async function POST(request: Request) {
  // @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
  // @MX:REASON: This route deletes ETL runs and related data and the app is
  // unauthenticated; reject cross-origin browser requests (see lib/security).
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

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
    }) as Array<{ id: string; sizeBytes: number | null }>;

    const etlRunIds = runsToDelete.map((r) => r.id);
    const freedSpaceBytes = runsToDelete.reduce((sum, r) => sum + (r.sizeBytes || 0), 0);

    if (etlRunIds.length > 0) {
      // Delete associated data in a single transaction (FK-safe child order).
      await db.$transaction((tx) =>
        deleteEtlRunsWithChildren(tx, etlRunIds)
      );
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
