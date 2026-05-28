import { NextRequest, NextResponse } from 'next/server';
import { db as prisma } from '@/lib/db';
import crypto from 'crypto';

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const connectionId = searchParams.get('connectionId');
    const incomingSecret = req.headers.get('x-jira-webhook-secret') || searchParams.get('secret');

    if (!connectionId) {
      return NextResponse.json({ success: false, error: 'Missing connectionId' }, { status: 400 });
    }

    // Verify webhook secret
    const expectedSecret = process.env.JIRA_WEBHOOK_SECRET;
    if (expectedSecret) {
      if (!incomingSecret) {
        return NextResponse.json({ success: false, error: 'Unauthorized: Missing secret' }, { status: 401 });
      }
      
      const expectedBuffer = Buffer.from(expectedSecret);
      const incomingBuffer = Buffer.from(incomingSecret);
      
      if (expectedBuffer.length !== incomingBuffer.length || !crypto.timingSafeEqual(expectedBuffer, incomingBuffer)) {
        return NextResponse.json({ success: false, error: 'Unauthorized: Invalid secret' }, { status: 401 });
      }
    }

    const payload = await req.json();
    const eventType = payload.webhookEvent; // e.g. "jira:issue_updated"
    const issue = payload.issue;

    if (!issue || !issue.key) {
      return NextResponse.json({ error: 'Invalid payload: No issue data' }, { status: 400 });
    }

    console.log(`[Webhook] Received ${eventType} for ${issue.key} (Connection: ${connectionId})`);

    // Transform Jira issue to MasterTicket format
    const jiraKey = issue.key;
    const fields = issue.fields || {};
    
    const resolvedDate = fields.resolutiondate ? new Date(fields.resolutiondate) : null;
    const updatedDate = fields.updated ? new Date(fields.updated) : new Date();
    const createdDate = fields.created ? new Date(fields.created) : new Date();
    const dueDate = fields.duedate ? new Date(fields.duedate) : null;

    // Save to MasterTicket
    await prisma.masterTicket.upsert({
      where: {
        connectionRef_jiraKey: {
          connectionRef: connectionId,
          jiraKey: jiraKey,
        },
      },
      update: {
        summary: fields.summary || 'No Summary',
        issueType: fields.issuetype?.name || 'Unknown',
        priority: fields.priority?.name || 'None',
        status: fields.status?.name || 'Unknown',
        assignee: fields.assignee?.displayName || null,
        reporter: fields.reporter?.displayName || null,
        updated: updatedDate,
        resolved: resolvedDate,
        dueDate: dueDate,
        storyPoints: fields.customfield_10016 ?? fields.customfield_10002 ?? fields.storyPoints ?? null,
        labels: JSON.stringify(fields.labels || []),
        components: JSON.stringify((fields.components || []).map((c: any) => c.name)),
        rawData: JSON.stringify(issue),
        lastUpdatedAt: new Date(),
      },
      create: {
        connectionRef: connectionId,
        jiraKey: jiraKey,
        summary: fields.summary || 'No Summary',
        issueType: fields.issuetype?.name || 'Unknown',
        priority: fields.priority?.name || 'None',
        status: fields.status?.name || 'Unknown',
        assignee: fields.assignee?.displayName || null,
        reporter: fields.reporter?.displayName || null,
        created: createdDate,
        updated: updatedDate,
        resolved: resolvedDate,
        dueDate: dueDate,
        storyPoints: fields.customfield_10016 ?? fields.customfield_10002 ?? fields.storyPoints ?? null,
        labels: JSON.stringify(fields.labels || []),
        components: JSON.stringify((fields.components || []).map((c: any) => c.name)),
        rawData: JSON.stringify(issue),
        firstSeenAt: new Date(),
        lastUpdatedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true, 
      message: `Processed ${eventType} for ${jiraKey}`,
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('[Webhook Error]', error, error.stack);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Support GET for testing/health check
export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' });
}
