import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Get the master ticket dataset for a connection.
 * This accumulates ALL tickets ever extracted, not just the latest run.
 * Used for KPI calculations on the full historical dataset.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  try {
    // Get all master tickets for this connection
    const masterTickets = await (db as any).masterTicket.findMany({
      where: { connectionId: connectionId },
      orderBy: { lastUpdatedAt: 'desc' }
    }) as any[];

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

    // Reconstruct raw issues for the KPI engine
    const reconstructedIssues = masterTickets.map(ticket => {
      const issue = JSON.parse(ticket.rawData);

      // Ensure changelog is properly reconstructed from transitions
      if (!issue.changelog && ticket.transitions) {
        issue.changelog = {
          histories: ticket.transitions.map((t: any) => ({
            created: t.occurredAt.toISOString(),
            author: t.author ? { displayName: t.author } : { displayName: 'Unknown' },
            items: [{
              field: 'status',
              fromString: t.fromStatus,
              toString: t.toStatus
            }]
          }))
        };
      }

      return issue;
    });

    // Calculate date range for display
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
  } catch (error) {
    console.error('Master dataset error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to retrieve master dataset'
    }, { status: 500 });
  }
}

/**
 * Clear the master dataset for a connection.
 * Useful for starting fresh or fixing corrupted data.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;

  try {
    const result = await (db as any).masterTicket.deleteMany({
      where: { connectionId: connectionId }
    });

    return NextResponse.json({
      success: true,
      message: `Cleared ${result.count} tickets from master dataset.`
    });
  } catch (error) {
    console.error('Clear master dataset error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to clear master dataset'
    }, { status: 500 });
  }
}
