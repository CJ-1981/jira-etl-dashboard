import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const { connectionId } = await params;
  const body = await request.json();
  const { storageConfig } = body;

  const db = getDb(storageConfig?.url);

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
    const reconstructedIssues = latestRun.ticketSnapshots.map(snapshot => {
      return {
        key: snapshot.jiraKey,
        fields: {
          summary: snapshot.summary,
          issuetype: { name: snapshot.issueType },
          priority: snapshot.priority ? { name: snapshot.priority } : null,
          status: { name: snapshot.status },
          assignee: snapshot.assignee ? { displayName: snapshot.assignee } : null,
          reporter: snapshot.reporter ? { displayName: snapshot.reporter } : null,
          created: snapshot.created.toISOString(),
          updated: snapshot.updated.toISOString(),
          resolutiondate: snapshot.resolved 
            ? new Date(snapshot.resolved).toISOString() 
            : (['Done', 'Closed', 'Resolved', 'Close', 'Completed'].includes(snapshot.status) ? new Date().toISOString() : null),
          duedate: snapshot.dueDate ? new Date(snapshot.dueDate).toISOString() : null,
          customfield_10002: snapshot.storyPoints,
          labels: JSON.parse(snapshot.labels || '[]'),
          components: JSON.parse(snapshot.components || '[]').map((name: string) => ({ name })),
        },
        changelog: {
          histories: snapshot.transitions.map(t => ({
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
