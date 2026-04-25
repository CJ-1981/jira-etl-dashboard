import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const body = await request.json();
  const { action, storageConfig } = body;

  const db = getDb(storageConfig?.url);

  try {
    if (action === 'get') {
      const masterTickets = await (db as any).masterTicket.findMany({
        where: { connectionRef: connectionId },
        orderBy: { lastUpdatedAt: 'desc' }
      });

      if (masterTickets.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            totalExtracted: 0,
            issues: [],
            message: 'No master dataset found. Extract data to build the master dataset.'
          }
        });
      }

      const reconstructedIssues = masterTickets.map((ticket: any) => {
        const issue = JSON.parse(ticket.rawData);
        return issue;
      });

      const dates = reconstructedIssues
        .map((i: any) => i.fields?.created || i.created)
        .filter((d: any) => d)
        .map((d: any) => new Date(d).getTime());
      
      const oldestDate = dates.length > 0 ? new Date(Math.min(...dates)) : null;
      const newestDate = dates.length > 0 ? new Date(Math.max(...dates)) : null;

      return NextResponse.json({
        success: true,
        data: {
          totalExtracted: reconstructedIssues.length,
          issues: reconstructedIssues,
          dateRange: {
            from: oldestDate?.toISOString() || null,
            to: newestDate?.toISOString() || null
          },
          lastUpdated: masterTickets[0]?.lastUpdatedAt?.toISOString() || new Date().toISOString()
        }
      });
    } else if (action === 'delete') {
      // Find all ETL runs for this connection
      const etlRuns = await (db as any).etlRun.findMany({
        where: { connectionRef: connectionId },
        select: { id: true }
      });
      const etlRunIds = etlRuns.map((r: any) => r.id);

      // Delete all related data in cascading order
      let deletedCount = 0;

      if (etlRunIds.length > 0) {
        // Delete KPI results
        const kpiResults = await (db as any).kpiResult.deleteMany({
          where: { etlRunId: { in: etlRunIds } }
        });
        deletedCount += kpiResults.count;

        // Delete ticket transitions
        const transitions = await (db as any).ticketTransition.deleteMany({
          where: { etlRunId: { in: etlRunIds } }
        });
        deletedCount += transitions.count;

        // Delete ticket snapshots
        const snapshots = await (db as any).ticketSnapshot.deleteMany({
          where: { etlRunId: { in: etlRunIds } }
        });
        deletedCount += snapshots.count;

        // Delete ETL runs
        const runs = await (db as any).etlRun.deleteMany({
          where: { id: { in: etlRunIds } }
        });
        deletedCount += runs.count;
      }

      // Delete master tickets
      const masterTickets = await (db as any).masterTicket.deleteMany({
        where: { connectionRef: connectionId }
      });
      deletedCount += masterTickets.count;

      return NextResponse.json({
        success: true,
        message: `Cleared ${etlRunIds.length} extractions, ${masterTickets.count} master tickets, and ${deletedCount} related records.`
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Master dataset error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process master dataset request'
    }, { status: 500 });
  }
}

// Keep DELETE for backward compatibility but it won't support dynamic URLs without a body (which is non-standard for DELETE)
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const db = getDb(); // Fallback to default
  try {
    // Find all ETL runs for this connection
    const etlRuns = await (db as any).etlRun.findMany({
      where: { connectionRef: connectionId },
      select: { id: true }
    });
    const etlRunIds = etlRuns.map((r: any) => r.id);

    // Delete all related data in cascading order
    let deletedCount = 0;

    if (etlRunIds.length > 0) {
      // Delete KPI results
      const kpiResults = await (db as any).kpiResult.deleteMany({
        where: { etlRunId: { in: etlRunIds } }
      });
      deletedCount += kpiResults.count;

      // Delete ticket transitions
      const transitions = await (db as any).ticketTransition.deleteMany({
        where: { etlRunId: { in: etlRunIds } }
      });
      deletedCount += transitions.count;

      // Delete ticket snapshots
      const snapshots = await (db as any).ticketSnapshot.deleteMany({
        where: { etlRunId: { in: etlRunIds } }
      });
      deletedCount += snapshots.count;

      // Delete ETL runs
      const runs = await (db as any).etlRun.deleteMany({
        where: { id: { in: etlRunIds } }
      });
      deletedCount += runs.count;
    }

    // Delete master tickets
    const masterTickets = await (db as any).masterTicket.deleteMany({
      where: { connectionRef: connectionId }
    });
    deletedCount += masterTickets.count;

    return NextResponse.json({
      success: true,
      message: `Cleared ${etlRunIds.length} extractions, ${masterTickets.count} master tickets, and ${deletedCount} related records.`
    });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Delete failed' }, { status: 500 });
  }
}
