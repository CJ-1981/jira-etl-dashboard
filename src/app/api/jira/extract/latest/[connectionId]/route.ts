/**
 * Latest Extraction API
 * Retrieves the latest completed ETL run for a connection
 */
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

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
    const latestRun = await (db as any).etlRun.findFirst({
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
    }) as any;

    if (!latestRun) {
      return NextResponse.json({ success: false, error: 'No saved extractions for this connection' });
    }

    // Reconstruct raw issues for the KPI engine
    const reconstructedIssues = latestRun.ticketSnapshots.map((snapshot: any) => {
      const raw = snapshot.rawData ? JSON.parse(snapshot.rawData) : {};

      // Collect every customfield_* stored in rawData so user-defined fields
      // (e.g. customfield_10032, customfield_10627) are not lost on this path.
      const rawCustomFields: Record<string, unknown> = {};
      if (raw.fields) {
        for (const [k, v] of Object.entries(raw.fields as Record<string, unknown>)) {
          if (k.startsWith('customfield_')) rawCustomFields[k] = v;
        }
      }

      // Recover issueOwnerTeam: prefer rawData field value, fall back to snapshot column
      const issueOwnerTeamValue = raw.fields?.customfield_10132 ?? raw.fields?.issueOwnerTeam ?? (snapshot as any).issueOwnerTeam ?? null;
      return {
        key: snapshot.jiraKey,
        fields: {
          // Spread all raw customfields first so none are silently dropped
          ...rawCustomFields,
          // Then override with authoritative column-backed values
          summary: snapshot.summary,
          project: raw.fields?.project,
          issuetype: { name: snapshot.issueType },
          priority: snapshot.priority ? { name: snapshot.priority } : null,
          status: { name: snapshot.status },
          assignee: snapshot.assignee ? { displayName: snapshot.assignee } : null,
          reporter: snapshot.reporter ? { displayName: snapshot.reporter } : null,
          created: snapshot.created.toISOString(),
          updated: snapshot.updated.toISOString(),
          resolutiondate: snapshot.resolved 
            ? new Date(snapshot.resolved).toISOString() 
            : (['Done', 'Closed', 'Resolved', 'Close', 'Completed', 'Ready to Close'].includes(snapshot.status) ? new Date().toISOString() : null),
          duedate: snapshot.dueDate ? new Date(snapshot.dueDate).toISOString() : null,
          customfield_10002: snapshot.storyPoints,
          customfield_10132: issueOwnerTeamValue,
          issueOwnerTeam: issueOwnerTeamValue,
          labels: JSON.parse(snapshot.labels || '[]'),
          components: JSON.parse(snapshot.components || '[]').map((name: string) => ({ name })),
        },
        changelog: {
          histories: snapshot.transitions.map((t: any) => ({
            created: t.occurredAt.toISOString(),
            author: t.author ? { displayName: t.author } : { displayName: 'Unknown' },
            items: [{
              field: 'status',
              fromString: t.fromStatus,
              toString: t.toStatus
            }]
          }))
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
    console.error('Latest extraction error:', error);
    return NextResponse.json({ success: false, error: 'Failed to retrieve latest extraction' }, { status: 500 });
  }
}
