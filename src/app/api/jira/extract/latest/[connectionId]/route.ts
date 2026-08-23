/**
 * Latest Extraction API
 * Retrieves the latest completed ETL run for a connection
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { handleApiError } from '@/lib/api-error';

/** Narrow slice of the EtlRun row (with snapshots) this handler reads. */
interface LatestRunRow {
  id: string;
  jql: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  completedAt: string | Date | null;
  ticketsProcessed: number | null;
  ticketSnapshots?: Array<{
    jiraKey: string;
    transitions?: unknown[];
  }>;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const body = await request.json();
  const { storageConfig } = body;

  const db = getDb(storageConfig);

  try {
    // Find the latest completed ETL run for this specific connection
    const latestRun = await db.etlRun.findFirst({
      where: { 
        connectionRef: connectionId,
        status: 'completed',
        autoSave: true 
      },
      orderBy: { completedAt: 'desc' },
      include: {
        ticketSnapshots: {
          include: {
            transitions: true
          }
        }
      }
    }) as LatestRunRow | null;

    if (!latestRun) {
      return NextResponse.json(
        { success: false, error: 'No saved extractions for this connection' },
        { status: 404 }
      );
    }

    // @MX:NOTE: Field data/rawData are reconstructed from MasterTicket, not TicketSnapshot.
    // @MX:REASON: TicketSnapshot has no rawData or issueOwnerTeam columns, so restoring from
    // snapshots silently dropped all custom fields and owner-team values. MasterTicket stores
    // the full raw issue JSON plus all flattened fields incl. issueOwnerTeam.
    const masterTickets = await db.masterTicket.findMany({
      where: { connectionRef: connectionId }
    });

    // Snapshot transitions keyed by jiraKey — used as fallback changelog source for
    // master tickets whose rawData lacks changelog (e.g. rows created via webhook).
    const snapshotTransitionsByKey = new Map<string, any[]>();
    for (const snapshot of (latestRun.ticketSnapshots || [])) {
      snapshotTransitionsByKey.set(snapshot.jiraKey, snapshot.transitions || []);
    }

    // Reconstruct raw issues for the KPI engine
    const reconstructedIssues = masterTickets.map((ticket: any) => {
      let raw: any = {};
      try {
        raw = ticket.rawData ? JSON.parse(ticket.rawData) : {};
      } catch {
        raw = {};
      }
      const rawFields: Record<string, unknown> = (raw && raw.fields) || {};

      // Recover issueOwnerTeam: prefer the flattened MasterTicket column, then rawData field value
      const issueOwnerTeamValue = ticket.issueOwnerTeam ?? rawFields.customfield_10132 ?? rawFields.issueOwnerTeam ?? null;

      // Changelog: prefer rawData changelog (stored at extraction time with expand=changelog),
      // fall back to snapshot transitions when rawData has none.
      let histories: any[];
      if (Array.isArray(raw.changelog?.histories)) {
        histories = raw.changelog.histories;
      } else {
        const transitions = snapshotTransitionsByKey.get(ticket.jiraKey) || [];
        histories = transitions.map((t: any) => ({
          created: t.occurredAt ? new Date(t.occurredAt).toISOString() : new Date().toISOString(),
          author: t.author ? { displayName: t.author } : { displayName: 'Unknown' },
          items: [{
            field: 'status',
            fromString: t.fromStatus,
            toString: t.toStatus
          }]
        }));
      }

      let labels: string[] = [];
      try {
        labels = Array.isArray(rawFields.labels) ? rawFields.labels as string[] : JSON.parse(ticket.labels || '[]');
      } catch { labels = []; }

      let componentNames: string[] = [];
      try {
        const comps = rawFields.components;
        componentNames = Array.isArray(comps)
          ? comps.map((c: any) => (typeof c === 'string' ? c : c?.name)).filter(Boolean)
          : JSON.parse(ticket.components || '[]');
      } catch { componentNames = []; }

      const resolvedIso = ticket.resolved
        ? new Date(ticket.resolved).toISOString()
        : (typeof rawFields.resolutiondate === 'string'
            ? rawFields.resolutiondate
            : (['Done', 'Closed', 'Resolved', 'Close', 'Completed', 'Ready to Close'].includes(ticket.status) ? new Date().toISOString() : null));

      return {
        key: ticket.jiraKey,
        fields: {
          // Spread all raw fields first so no custom/extra fields are silently dropped
          ...rawFields,
          // Then override with authoritative column-backed values
          summary: ticket.summary ?? rawFields.summary,
          issuetype: { name: ticket.issueType ?? (rawFields.issuetype as any)?.name },
          priority: ticket.priority ? { name: ticket.priority } : (rawFields.priority ?? null),
          status: { name: ticket.status ?? (rawFields.status as any)?.name },
          assignee: ticket.assignee ? { displayName: ticket.assignee } : (rawFields.assignee ?? null),
          reporter: ticket.reporter ? { displayName: ticket.reporter } : (rawFields.reporter ?? null),
          created: ticket.created ? new Date(ticket.created).toISOString() : rawFields.created,
          updated: ticket.updated ? new Date(ticket.updated).toISOString() : rawFields.updated,
          resolutiondate: resolvedIso,
          duedate: ticket.dueDate ? new Date(ticket.dueDate).toISOString() : (rawFields.duedate ?? null),
          customfield_10002: ticket.storyPoints ?? rawFields.customfield_10002 ?? null,
          customfield_10132: issueOwnerTeamValue,
          issueOwnerTeam: issueOwnerTeamValue,
          labels,
          components: componentNames.map((name: string) => ({ name })),
        },
        changelog: {
          histories
        }
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        totalExtracted: latestRun.ticketsProcessed ?? reconstructedIssues.length,
        etlRunId: latestRun.id,
        timestamp: latestRun.completedAt,
        dateFrom: latestRun.dateFrom,
        dateTo: latestRun.dateTo,
        jql: latestRun.jql,
        issues: reconstructedIssues
      }
    });
  } catch (error) {
    return handleApiError(error);
  }
}
