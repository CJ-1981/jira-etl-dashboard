import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getKpiEngine } from '@/lib/kpi/engine';
import { isLoopbackOriginRequest } from '@/lib/security';

export async function POST(request: Request) {
  // @MX:WARN: SECURITY BOUNDARY — loopback-origin guard (CSRF protection).
  // @MX:REASON: This route writes data into a database chosen by the request
  // body and the app is unauthenticated; reject cross-origin browser requests
  // (see lib/security).
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { connection, issues, exportDataType = 'kpi', holidays, dateFrom, dateTo } = body;

    if (!connection) {
      return NextResponse.json({ success: false, error: 'Database connection details are required' }, { status: 400 });
    }

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json({ success: false, error: 'Issues array is required' }, { status: 400 });
    }

    const db = getDb({
      provider: 'postgresql',
      ...connection
    });

    let rowCount = 0;
    const shouldExportTickets = exportDataType === 'tickets' || exportDataType === 'both';
    const shouldExportKpis = exportDataType === 'kpi' || exportDataType === 'both';

    if (shouldExportTickets) {
      // Sync Raw Tickets to MasterTicket table in target DB
      for (const issue of issues) {
        const rawSp = (issue.fields as any)['customfield_10002'];
        const storyPoints = typeof rawSp === 'number' ? rawSp : (typeof rawSp === 'string' && !isNaN(parseFloat(rawSp)) ? parseFloat(rawSp) : null);

        await db.masterTicket.upsert({
          where: { connectionRef_jiraKey: { connectionRef: 'external_export', jiraKey: issue.key } },
          create: {
            connectionRef: 'external_export',
            jiraKey: issue.key,
            summary: issue.fields.summary,
            issueType: issue.fields.issuetype.name,
            priority: issue.fields.priority?.name,
            status: issue.fields.status.name,
            assignee: issue.fields.assignee?.displayName,
            reporter: issue.fields.reporter?.displayName,
            created: new Date(issue.fields.created),
            updated: new Date(issue.fields.updated),
            resolved: issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null,
            dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
            storyPoints: storyPoints,
            labels: JSON.stringify(issue.fields.labels || []),
            components: JSON.stringify(issue.fields.components?.map((c: any) => c.name) || []),
            rawData: JSON.stringify(issue),
          },
          update: {
            summary: issue.fields.summary,
            issueType: issue.fields.issuetype.name,
            priority: issue.fields.priority?.name,
            status: issue.fields.status.name,
            assignee: issue.fields.assignee?.displayName,
            reporter: issue.fields.reporter?.displayName,
            updated: new Date(issue.fields.updated),
            resolved: issue.fields.resolutiondate ? new Date(issue.fields.resolutiondate) : null,
            dueDate: issue.fields.duedate ? new Date(issue.fields.duedate) : null,
            storyPoints: storyPoints,
            labels: JSON.stringify(issue.fields.labels || []),
            components: JSON.stringify(issue.fields.components?.map((c: any) => c.name) || []),
            rawData: JSON.stringify(issue),
            lastUpdatedAt: new Date()
          }
        });
        rowCount++;
      }
    }

    if (shouldExportKpis) {
      // Calculate and sync KPIs
      const engine = getKpiEngine();
      const start = dateFrom ? new Date(dateFrom) : new Date(0);
      const end = dateTo ? new Date(dateTo) : new Date();

      // If dateTo was just a date string (YYYY-MM-DD), ensure it covers the full day
      if (dateTo && typeof dateTo === 'string' && dateTo.length <= 10) {
        end.setHours(23, 59, 59, 999);
      }
      
      const kpiResults = engine.calculateAll(issues, holidays || { regions: [] }, { start, end });

      const kpiData: any[] = [];
      for (const [kpiId, results] of Object.entries(kpiResults)) {
        const plugin = engine.getPlugin(kpiId);
        for (const res of results) {
          kpiData.push({
            connectionRef: 'external_export',
            kpiId: kpiId,
            kpiName: plugin?.name || res.name,
            value: res.value,
            unit: res.unit || plugin?.unit || '',
            dimensions: JSON.stringify(res.dimensions || {}),
            periodStart: start,
            periodEnd: end,
          });
        }
      }

      if (kpiData.length > 0) {
        await db.kpiResult.createMany({ data: kpiData });
        rowCount += kpiData.length;
      }
    }

    return NextResponse.json({ success: true, rowCount });
  } catch (error) {
    console.error('Database export error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown database error' 
    }, { status: 500 });
  }
}
