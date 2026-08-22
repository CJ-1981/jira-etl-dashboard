import { NextRequest, NextResponse } from 'next/server';
import { getDefaultDb } from '@/lib/db';
import crypto from 'crypto';

/**
 * @MX:WARN: Check whether a request carries a browser Origin/Referer header that
 * is NOT loopback. Browsers always send Origin on cross-origin POSTs, so a header
 * pointing at a non-localhost origin indicates a cross-site request (potential
 * CSRF/SSRF against this local API) and must be rejected when no secret is set.
 * Requests with no Origin/Referer (server-to-server webhooks, curl) are allowed.
 */
function isLoopbackOrigin(req: NextRequest): boolean {
  const check = (value: string | null): boolean => {
    if (!value) return true; // header absent — not a browser cross-origin request
    try {
      const url = new URL(value);
      const host = url.hostname.toLowerCase();
      // @MX:REASON: Only http(s) URLs whose host is a loopback name are trusted;
      // anything else (including exotic schemes) is treated as cross-origin.
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    } catch {
      // Unparseable header value: fail closed — legitimate server-to-server
      // Jira webhooks do not send Origin/Referer at all.
      return false;
    }
  };
  return check(req.headers.get('origin')) && check(req.headers.get('referer'));
}

/**
 * @MX:REASON: Jira may return story points as a numeric string; the DB column is
 * Float, so coerce to number and map non-numeric values to null (never pass NaN).
 */
function coerceStoryPoints(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

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
    } else if (!isLoopbackOrigin(req)) {
      // @MX:WARN: No webhook secret is configured, so restrict writes to loopback-originated
      // requests only. A malicious web page could otherwise POST forged webhook payloads to
      // this localhost endpoint and corrupt the database (browsers always send an Origin
      // header on cross-origin POSTs; Jira's server-to-server webhooks send neither,
      // so direct server webhooks still work when invoked locally).
      return NextResponse.json({ success: false, error: 'Unauthorized: No webhook secret configured; loopback requests only' }, { status: 401 });
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
    // @MX:REASON: Coerce once and reuse — story points may arrive as numeric strings
    // but the DB column is Float; non-numeric values map to null instead of NaN.
    const storyPoints = coerceStoryPoints(fields.customfield_10016 ?? fields.customfield_10002 ?? fields.storyPoints);

    // Save to MasterTicket
    // @MX:NOTE: Uses getDefaultDb() to obtain the real Prisma client.
    // @MX:REASON: The `db` export is a proxy exposing only `.client`; calling
    // model accessors on it directly yields undefined and crashes at runtime.
    const prisma = getDefaultDb();
    await (prisma as any).masterTicket.upsert({
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
        storyPoints: storyPoints,
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
        storyPoints: storyPoints,
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
