import { NextResponse } from 'next/server';
import { getDefaultDb } from '@/lib/db';
import { isLoopbackOriginRequest } from '@/lib/security';
import { getIssueOwnerTeamField, getStoryPointsField } from '@/lib/jira/field-config';
import { extractSelectFieldValue } from '@/lib/jira/client';
import { handleApiError, InternalServerError } from '@/lib/api-error';
import crypto from 'crypto';

/**
 * @MX:WARN: SECURITY BOUNDARY — webhook loopback check (CSRF protection),
 * composed on top of the shared isLoopbackOriginRequest guard.
 * @MX:REASON: The shared guard only inspects whichever of Origin/Referer is
 * present first and trusts any scheme whose host is loopback. The original
 * webhook-local check was stricter, and we must not loosen security by
 * consolidating, so this composes the shared guard with the two stricter
 * rules: (1) BOTH Origin and Referer must be loopback when present, and
 * (2) only http(s) URLs are trusted (exotic schemes are treated as
 * cross-origin). Requests with no Origin/Referer (server-to-server Jira
 * webhooks, curl) still pass, as before.
 */
function isWebhookLoopbackRequest(req: Request): boolean {
  // Shared guard: fail-closed loopback host classification of the primary header.
  if (!isLoopbackOriginRequest(req)) return false;

  // Stricter webhook-local composition (see @MX:REASON above).
  const check = (value: string | null): boolean => {
    if (!value) return true; // header absent — not a browser cross-origin request
    try {
      const url = new URL(value);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
      // Re-classify this single header value with the shared guard by
      // presenting it as the request's Origin.
      return isLoopbackOriginRequest(
        new Request(req.url, { headers: { origin: value } }),
      );
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

export async function POST(req: Request) {
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
    } else if (!isWebhookLoopbackRequest(req)) {
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
      return NextResponse.json({ success: false, error: 'Invalid payload: No issue data' }, { status: 400 });
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
    // customfield_10016 is an instance-specific override; getStoryPointsField()
    // supplies the configured default (customfield_10002) like the extract pipeline.
    const storyPoints = coerceStoryPoints(fields.customfield_10016 ?? fields[getStoryPointsField()] ?? fields.storyPoints);

    // @MX:WARN: Data parity with the extract pipeline — issueOwnerTeam must be
    // persisted here too.
    // @MX:REASON: The extract route stores the Issue Owner Team field; webhook
    // updates that skipped it silently dropped team attribution on every
    // webhook-touched ticket (open_tickets_by_issue_owner_team undercounted).
    const teamFieldId = getIssueOwnerTeamField();
    const issueOwnerTeam = fields[teamFieldId] !== undefined
      ? extractSelectFieldValue(fields[teamFieldId]) || null
      : null;

    // Save to MasterTicket
    // @MX:NOTE: Uses getDefaultDb() to obtain the real Prisma client.
    // @MX:REASON: The `db` export is a proxy exposing only `.client`; calling
    // model accessors on it directly yields undefined and crashes at runtime.
    const prisma = getDefaultDb();
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
        storyPoints: storyPoints,
        issueOwnerTeam: issueOwnerTeam,
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
        issueOwnerTeam: issueOwnerTeam,
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
  } catch (error) {
    // Log full details server-side, but return a generic message to the caller:
    // this endpoint can be invoked by an external Jira server (when a webhook
    // secret is configured), so internal (e.g. Prisma/SQL) error text must not
    // leak across the boundary.
    console.error('[Webhook Error]', error);
    return handleApiError(new InternalServerError('Internal server error'));
  }
}

// Support GET for testing/health check
export async function GET() {
  return NextResponse.json({ status: 'Webhook endpoint active' });
}
