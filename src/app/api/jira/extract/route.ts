import { NextResponse } from 'next/server';
import { JiraClient } from '@/lib/jira/client';
import { db } from '@/lib/db';
import { existsSync, readFileSync } from 'fs';
import path from 'path';

function getSettings() {
  try {
    const settingsPath = path.join(process.cwd(), 'data', 'settings.json');
    if (existsSync(settingsPath)) {
      return JSON.parse(readFileSync(settingsPath, 'utf-8'));
    }
  } catch { /* ignore */ }
  return { rateLimit: { delayMs: 0, maxRequestsPerMinute: 60, batchSize: 50, backoffStrategy: 'none' } };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { connectionId, jql, dateFrom, dateTo, daysBack, saveExtraction } = body;

    if (!connectionId) {
      return NextResponse.json(
        { success: false, error: 'connectionId is required' },
        { status: 400 }
      );
    }

    // Calculate effective dateFrom from daysBack
    let effectiveDateFrom = dateFrom;
    let effectiveDateTo = dateTo;

    if (daysBack && !dateFrom) {
      const now = new Date();
      const from = new Date(now);
      from.setDate(from.getDate() - daysBack);
      effectiveDateFrom = from.toISOString().split('T')[0];
      if (!effectiveDateTo) {
        effectiveDateTo = now.toISOString().split('T')[0];
      }
    }

    // Get connection with full token
    const connection = await db.jiraConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return NextResponse.json(
        { success: false, error: 'Connection not found' },
        { status: 404 }
      );
    }

    // Validate connection has required fields
    if (!connection.baseUrl || !connection.email || !connection.apiToken) {
      return NextResponse.json(
        { success: false, error: 'Connection is missing required fields (baseUrl, email, or apiToken)' },
        { status: 400 }
      );
    }

    const settings = getSettings();
    const rateLimit = settings.rateLimit || {};

    const client = new JiraClient({
      baseUrl: connection.baseUrl,
      email: connection.email,
      apiToken: connection.apiToken,
      projectKeys: connection.projectKeys ? connection.projectKeys.split(',') : [],
    });

    // Build JQL
    let finalJql = jql;
    if (!finalJql) {
      finalJql = client.buildDefaultJql({ dateFrom: effectiveDateFrom, dateTo: effectiveDateTo });
    }

    console.log(`Starting extraction for connection ${connectionId} with JQL: ${finalJql}`);

    // Extract issues with rate limiting settings and progress tracking
    let extractedCount = 0;
    let totalCount = 0;
    const issues = await client.extractIssues(finalJql, {
      maxResults: rateLimit.batchSize || 50,
      expand: ['changelog'],
      delayMs: rateLimit.delayMs || 0,
      backoffStrategy: rateLimit.backoffStrategy || 'none',
      onProgress: (progress: number, total: number) => {
        extractedCount = progress;
        totalCount = total;
        console.log(`Extraction progress: ${progress}/${total} issues`);
      },
    });

    console.log(`Extraction completed: ${issues.length} issues extracted`);

    // Check if we should save this extraction
    const shouldSave = saveExtraction ?? settings.persistence?.autoSave ?? true;

    // Prune old extractions for this connection to prevent DB bloat
    if (shouldSave && connectionId) {
      // Normalize JQL by removing date filters to identify "similar" extraction types
      // (e.g. "Last 7 days" run yesterday vs today should be treated as the same type)
      const normalize = (j: string) => j.replace(/created\s*[<>]=\s*"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
      const currentTemplate = normalize(finalJql);

      const allRuns = await (db as any).etlRun.findMany({
        where: { connectionId: connectionId },
        select: { id: true, jql: true }
      });
      
      // Find runs with the same "JQL Template" (ignoring dates)
      const runsToPrune = allRuns.filter((r: any) => normalize(r.jql || '') === currentTemplate);
      const oldRunIds = runsToPrune.map((r: any) => r.id);
      
      if (oldRunIds.length > 0) {
        const snapshotIds = await (db as any).ticketSnapshot.findMany({
          where: { etlRunId: { in: oldRunIds } },
          select: { id: true }
        });
        
        if (snapshotIds.length > 0) {
          await (db as any).ticketTransition.deleteMany({
            where: { ticketSnapshotId: { in: snapshotIds.map((s: any) => s.id) } }
          });
        }
        
        await (db as any).ticketSnapshot.deleteMany({
          where: { etlRunId: { in: oldRunIds } }
        });
        
        await (db as any).kpiResult.deleteMany({
          where: { etlRunId: { in: oldRunIds } }
        });
        
        await (db as any).etlRun.deleteMany({
          where: { id: { in: oldRunIds } }
        });
      }
    }

    // Create ETL run record
    let etlRun;
    try {
      etlRun = await (db as any).etlRun.create({
        data: {
          pipelineId: body.pipelineId || null,
          status: 'completed',
          ticketsProcessed: issues.length,
          startedAt: new Date(),
          completedAt: new Date(),
          // Store metadata for persistence
          jql: finalJql,
          dateFrom: effectiveDateFrom,
          dateTo: effectiveDateTo,
          connectionId: connectionId,
          autoSave: shouldSave,
          sizeBytes: Buffer.byteLength(JSON.stringify(issues)),
          metadata: JSON.stringify({
            version: '1.0',
            extractParams: {
              jql: finalJql,
              dateFrom: effectiveDateFrom,
              dateTo: effectiveDateTo,
              daysBack,
            },
          }),
        },
      });
    } catch (dbError) {
      console.error('Failed to create ETL run record:', dbError);
      throw new Error('Database error: Failed to create extraction record. Please try again.');
    }

    // Store ticket snapshots with error handling
    try {
      if (issues.length > 0) {
        await db.ticketSnapshot.createMany({
          data: issues.map((issue) => {
            const rawSp = (issue.fields as Record<string, unknown>)['customfield_10002'];
            const storyPoints = typeof rawSp === 'number' ? rawSp : (typeof rawSp === 'string' && !isNaN(parseFloat(rawSp)) ? parseFloat(rawSp) : null);

            return {
              etlRunId: etlRun.id,
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
              storyPoints,
              labels: JSON.stringify(issue.fields.labels || []),
              components: JSON.stringify(issue.fields.components?.map((c) => c.name) || []),
            };
          }),
        });

        // Store transitions
        const transitionData: Array<{
          ticketSnapshotId: string;
          fromStatus: string | null;
          toStatus: string;
          author: string | undefined;
          occurredAt: Date;
        }> = [];

        // We need the snapshot IDs - fetch them
        const snapshots = await db.ticketSnapshot.findMany({
          where: { etlRunId: etlRun.id },
        });

        for (let i = 0; i < issues.length; i++) {
          const issue = issues[i];
          const snapshot = snapshots[i];
          if (!snapshot || !issue.changelog?.histories) continue;

          for (const history of issue.changelog.histories) {
            for (const item of history.items) {
              if (item.field === 'status') {
                transitionData.push({
                  ticketSnapshotId: snapshot.id,
                  fromStatus: item.fromString || null,
                  toStatus: item.toString || 'Unknown',
                  author: history.author?.displayName,
                  occurredAt: new Date(history.created),
                });
              }
            }
          }
        }

        if (transitionData.length > 0) {
          await db.ticketTransition.createMany({ data: transitionData });
        }
      }
    } catch (dbError) {
      console.error('Failed to save extraction data:', dbError);

      // Cleanup: Delete the ETL run record if database save failed
      try {
        await (db as any).etlRun.delete({
          where: { id: etlRun.id }
        });
      } catch (cleanupError) {
        console.error('Failed to cleanup after error:', cleanupError);
      }

      throw new Error('Database error: Failed to save extracted data. The extraction succeeded but could not be saved. Please try again.');
    }

    // Update master dataset - accumulate all tickets for KPI calculations
    try {
      console.log('Updating master dataset...');

      for (const issue of issues) {
        const rawSp = (issue.fields as Record<string, unknown>)['customfield_10002'];
        const storyPoints = typeof rawSp === 'number' ? rawSp : (typeof rawSp === 'string' && !isNaN(parseFloat(rawSp)) ? parseFloat(rawSp) : null);

        await (db as any).masterTicket.upsert({
          where: {
            connectionId_jiraKey: {
              connectionId: connectionId,
              jiraKey: issue.key
            }
          },
          create: {
            connectionId: connectionId,
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
            components: JSON.stringify(issue.fields.components?.map((c) => c.name) || []),
            rawData: JSON.stringify(issue),
            firstSeenAt: new Date(),
            lastUpdatedAt: new Date()
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
            components: JSON.stringify(issue.fields.components?.map((c) => c.name) || []),
            rawData: JSON.stringify(issue),
            lastUpdatedAt: new Date()
          }
        });
      }

      console.log('Master dataset updated successfully');
    } catch (masterError) {
      console.error('Failed to update master dataset:', masterError);
      // Don't fail the extraction if master dataset update fails
      // Just log the error and continue
    }

    // Return summary + raw issues for KPI calculation
    return NextResponse.json({
      success: true,
      etlRunId: etlRun.id,
      summary: {
        totalExtracted: issues.length,
        jql: finalJql,
        timestamp: new Date().toISOString(),
        effectiveDateFrom,
        effectiveDateTo,
      },
      issues: issues, // Return raw issues to ensure KPI engine has all fields
    });
  } catch (error) {
    console.error('Extract error:', error);

    // Determine error type and provide actionable message
    let errorMessage = 'Unknown error occurred';
    let statusCode = 500;

    if (error instanceof Error) {
      const errorMsg = error.message.toLowerCase();

      // Network/connection errors
      if (errorMsg.includes('fetch failed') || errorMsg.includes('network') || errorMsg.includes('ename not resolved')) {
        errorMessage = 'Network error: Unable to reach Jira server. Please check your connection and baseUrl.';
        statusCode = 503;
      }
      // Authentication errors
      else if (errorMsg.includes('401') || errorMsg.includes('403') || errorMsg.includes('unauthorized') || errorMsg.includes('forbidden')) {
        errorMessage = 'Authentication failed: Please verify your email and API token are correct.';
        statusCode = 401;
      }
      // Rate limiting
      else if (errorMsg.includes('429') || errorMsg.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded: Please increase the delay in settings or try again later.';
        statusCode = 429;
      }
      // Timeout
      else if (errorMsg.includes('timeout') || errorMsg.includes('abort')) {
        errorMessage = 'Request timeout: The Jira server took too long to respond. Try reducing the batch size or date range.';
        statusCode = 504;
      }
      // JQL errors
      else if (errorMsg.includes('jql') || errorMsg.includes('query failed')) {
        errorMessage = `JQL Error: ${error.message}`;
        statusCode = 400;
      }
      // Database errors
      else if (errorMsg.includes('database') || errorMsg.includes('prisma')) {
        errorMessage = 'Database error: Failed to save extracted data. Please try again.';
        statusCode = 500;
      }
      // Generic error with context
      else {
        errorMessage = error.message;
      }
    }

    return NextResponse.json(
      {
        success: false,
        error: errorMessage,
        errorCode: statusCode,
        timestamp: new Date().toISOString(),
      },
      { status: statusCode }
    );
  }
}
