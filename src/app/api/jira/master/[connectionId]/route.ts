/**
 * Jira Master Dataset API
 * Handles fetching and deleting master tickets for a connection
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params;
    
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    
    const { action, storageConfig } = body;
    const db = getDb(storageConfig);

    if (action === 'get') {
      const includeRawData = body.includeRawData === true;
      console.log(`[Master API] Fetching tickets for connection: ${connectionId} (rawData=${includeRawData})`);
      
      const masterTickets = await (db as any).masterTicket.findMany({
        where: { connectionRef: connectionId },
        orderBy: { lastUpdatedAt: 'desc' },
        select: {
          jiraKey: true,
          summary: true,
          issueType: true,
          priority: true,
          status: true,
          assignee: true,
          reporter: true,
          issueOwnerTeam: true,
          created: true,
          updated: true,
          resolved: true,
          dueDate: true,
          storyPoints: true,
          labels: true,
          components: true,
          lastUpdatedAt: true,
          // Always fetch rawData — needed to restore arbitrary custom fields
          // (e.g. customfield_10032, customfield_10627) in the lightweight path.
          rawData: true,
        }
      });

      if (!masterTickets || masterTickets.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            totalExtracted: 0,
            issues: [],
            message: 'No master dataset found. Extract data to build the master dataset.'
          }
        });
      }

      // Reconstruct lightweight issue objects for the UI
      const reconstructedIssues = masterTickets.map((ticket: any) => {
        if (includeRawData && ticket.rawData) {
          try { return JSON.parse(ticket.rawData); } catch { /* fall through */ }
        }

        // Extract every customfield_* from rawData so user-defined fields
        // (e.g. customfield_10032, customfield_10627) are not silently dropped.
        const rawCustomFields: Record<string, unknown> = {};
        if (ticket.rawData) {
          try {
            const raw = JSON.parse(ticket.rawData);
            if (raw.fields) {
              for (const [k, v] of Object.entries(raw.fields as Record<string, unknown>)) {
                if (k.startsWith('customfield_')) rawCustomFields[k] = v;
              }
            }
          } catch { /* ignore parse errors */ }
        }

        // Build a minimal Jira-shaped issue from stored columns,
        // with raw custom fields as the base so none are lost.
        return {
          key: ticket.jiraKey,
          fields: {
            // Spread all raw customfields first
            ...rawCustomFields,
            // Then override with authoritative column-backed values
            summary: ticket.summary,
            issuetype: { name: ticket.issueType },
            priority: { name: ticket.priority },
            status: { name: ticket.status },
            assignee: ticket.assignee ? { displayName: ticket.assignee } : null,
            reporter: ticket.reporter ? { displayName: ticket.reporter } : null,
            created: ticket.created?.toISOString(),
            updated: ticket.updated?.toISOString(),
            resolutiondate: ticket.resolved?.toISOString() || null,
            duedate: ticket.dueDate?.toISOString() || null,
            storyPoints: ticket.storyPoints,
            customfield_10002: ticket.storyPoints,
            customfield_10132: ticket.issueOwnerTeam ?? null,
            issueOwnerTeam: ticket.issueOwnerTeam ?? null,
            labels: (() => { try { return JSON.parse(ticket.labels || '[]'); } catch { return []; } })(),
            components: (() => { try { return JSON.parse(ticket.components || '[]').map((n: string) => ({ name: n })); } catch { return []; } })(),
          }
        };
      });

      const dates = reconstructedIssues
        .map((i: any) => i.fields?.created)
        .filter(Boolean)
        .map((d: string) => { const t = new Date(d).getTime(); return isNaN(t) ? null : t; })
        .filter((t: number | null): t is number => t !== null);

      const oldestDate = dates.length > 0 ? new Date(dates.reduce((a, b) => Math.min(a, b))) : null;
      const newestDate = dates.length > 0 ? new Date(dates.reduce((a, b) => Math.max(a, b))) : null;

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
      console.log(`[Master API] Deleting data for connection: ${connectionId}`);
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
        const snapshotIds = await (db as any).ticketSnapshot.findMany({
          where: { etlRunId: { in: etlRunIds } },
          select: { id: true }
        });
        
        if (snapshotIds.length > 0) {
          const transitions = await (db as any).ticketTransition.deleteMany({
            where: { ticketSnapshotId: { in: snapshotIds.map((s: any) => s.id) } }
          });
          deletedCount += transitions.count;
        }

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
    console.error('[Master API] Error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process master dataset request'
    }, { status: 500 });
  }
}

// Keep DELETE for backward compatibility
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  try {
    const { connectionId } = await params;
    const db = getDb(); // Fallback to default
    
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
      const snapshotIds = await (db as any).ticketSnapshot.findMany({
        where: { etlRunId: { in: etlRunIds } },
        select: { id: true }
      });
      
      if (snapshotIds.length > 0) {
        const transitions = await (db as any).ticketTransition.deleteMany({
          where: { ticketSnapshotId: { in: snapshotIds.map((s: any) => s.id) } }
        });
        deletedCount += transitions.count;
      }

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
