import { NextResponse } from 'next/server';
import { JiraClient } from '@/lib/jira/client';

/**
 * POST /api/jira/test-issue
 * Fetch a single Jira issue to verify credentials and field access.
 *
 * @MX:NOTE: Connection credentials arrive in the request body.
 * @MX:REASON: Connections are stored client-side in localStorage, not in the database.
 * The previous implementation queried a `jiraConnection` Prisma table that no longer
 * exists in the schema, so this route always failed with "Connection not found".
 * This now mirrors the /api/jira/test pattern.
 *
 * Expected body: { baseUrl, email, apiToken, issueKey }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { baseUrl, email, apiToken, issueKey } = body;

    if (!baseUrl || !email || !apiToken || !issueKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing required fields: baseUrl, email, apiToken, issueKey'
      }, { status: 400 });
    }

    const client = new JiraClient({
      baseUrl: baseUrl.trim(),
      email: email.trim(),
      apiToken: apiToken.trim(),
      projectKeys: [],
    });

    console.log(`[Test Issue] Fetching issue ${issueKey}`);
    const issue = await client.getIssue(issueKey);

    if (!issue) {
      return NextResponse.json({
        success: false,
        error: `Issue ${issueKey} not found or not accessible via API`
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      issue: {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status?.name,
        created: issue.fields.created,
        assignee: issue.fields.assignee?.displayName ?? null,
      }
    });

  } catch (error) {
    console.error('Test issue error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch issue'
    }, { status: 500 });
  }
}
