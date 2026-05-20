import { NextRequest, NextResponse } from 'next/server';
import { JiraClient } from '@/lib/jira/client';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { jiraCredentials, jql } = body;

    if (!jiraCredentials?.baseUrl || !jiraCredentials?.email || !jiraCredentials?.apiToken) {
      return NextResponse.json({ success: false, error: 'Missing Jira credentials' }, { status: 400 });
    }

    const client = new JiraClient({
      baseUrl: jiraCredentials.baseUrl,
      email: jiraCredentials.email,
      apiToken: jiraCredentials.apiToken,
      projectKeys: jiraCredentials.projectKeys ? jiraCredentials.projectKeys.split(',') : [],
    });

    const fields = await client.discoverCustomFields(jql || '');

    return NextResponse.json({ success: true, fields });
  } catch (err: any) {
    console.error('[Fields Suggest API]', err);
    return NextResponse.json({ success: false, error: err.message || 'Unknown error' }, { status: 500 });
  }
}
