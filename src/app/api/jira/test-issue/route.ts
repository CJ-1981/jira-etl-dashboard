import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { JiraClient } from '@/lib/jira/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { connectionId, issueKey } = body;

    if (!connectionId || !issueKey) {
      return NextResponse.json({
        success: false,
        error: 'Missing connectionId or issueKey'
      }, { status: 400 });
    }

    // Get connection credentials
    const connection = await (db as any).jiraConnection.findUnique({
      where: { id: connectionId }
    });

    if (!connection) {
      return NextResponse.json({
        success: false,
        error: 'Connection not found'
      }, { status: 404 });
    }

    // Create Jira client and fetch issue
    const client = new JiraClient({
      baseUrl: connection.baseUrl,
      email: connection.email,
      apiToken: connection.apiToken,
      projectKeys: connection.projectKeys ? connection.projectKeys.split(',') : [],
    });

    console.log(`[Test Issue] Fetching issue ${issueKey} for connection ${connectionId}`);
    const issue = await client.getIssue(issueKey);

    if (!issue) {
      return NextResponse.json({
        success: false,
        error: `Issue ${issueKey} not found or not accessible via API`
      });
    }

    return NextResponse.json({
      success: true,
      issue: {
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        created: issue.fields.created,
        project: 'Project info would need additional API call',
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
