/**
 * Jira Master Dataset API
 * Handles fetching and deleting master tickets for a connection
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { isLoopbackOriginRequest } from '@/lib/security';
import { deleteConnectionData } from '@/lib/db-cascade';
import { handleApiError } from '@/lib/api-error';

/** Narrow slice of a MasterTicket row read directly (outside the map lambda). */
interface MasterTicketMeta {
  lastUpdatedAt: Date | null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  // @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
  // @MX:REASON: This route can delete the entire master dataset of a
  // connection (action: 'delete') and the app is unauthenticated; reject
  // cross-origin browser requests (see lib/security).
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    const { connectionId } = await params;
    
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }
    
    const { action, storageConfig } = body;
    const db = getDb(storageConfig);

    if (action === 'get') {
      const includeRawData = body.includeRawData === true;
      console.log(`[Master API] Fetching tickets for connection: ${connectionId} (rawData=${includeRawData})`);
      
      const masterTickets = await db.masterTicket.findMany({
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
      }) as MasterTicketMeta[];

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

      const oldestDate = dates.length > 0 ? new Date(dates.reduce((a: number, b: number) => Math.min(a, b))) : null;
      const newestDate = dates.length > 0 ? new Date(dates.reduce((a: number, b: number) => Math.max(a, b))) : null;

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
      // Transactional FK-safe cascade (shared with the connections route).
      const { runCount, masterTicketCount, deletedCount } =
        await deleteConnectionData(db, connectionId);

      return NextResponse.json({
        success: true,
        message: `Cleared ${runCount} extractions, ${masterTicketCount} master tickets, and ${deletedCount} related records.`
      });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    return handleApiError(error);
  }
}

// Keep DELETE for backward compatibility
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  // @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
  // @MX:REASON: This route deletes the entire master dataset of a connection
  // and the app is unauthenticated; reject cross-origin browser requests
  // (see lib/security).
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    const { connectionId } = await params;
    const db = getDb(); // Fallback to default

    // Transactional FK-safe cascade (shared with the connections route).
    const { runCount, masterTicketCount, deletedCount } =
      await deleteConnectionData(db, connectionId);

    return NextResponse.json({
      success: true,
      message: `Cleared ${runCount} extractions, ${masterTicketCount} master tickets, and ${deletedCount} related records.`
    });
  } catch (error) {
    return handleApiError(error);
  }
}
