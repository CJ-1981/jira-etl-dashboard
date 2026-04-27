import { NextResponse } from 'next/server';
import { JiraClient } from '@/lib/jira/client';
import { getDb } from '@/lib/db';
import { getKpiEngine } from '@/lib/kpi/engine';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { 
      connectionRef, 
      jiraCredentials, 
      rateLimit, 
      generalSettings,
      customPlugins,
      jql, 
      dateFrom, 
      dateTo, 
      daysBack, 
      saveExtraction,
      storageConfig
    } = body;

    const db = getDb(storageConfig?.url);

    if (!connectionRef) {
      return NextResponse.json({ success: false, error: 'connectionRef is required' }, { status: 400 });
    }

    if (!jiraCredentials || !jiraCredentials.baseUrl || !jiraCredentials.email || !jiraCredentials.apiToken) {
      return NextResponse.json({ success: false, error: 'Jira credentials are required' }, { status: 400 });
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

    const client = new JiraClient({
      baseUrl: jiraCredentials.baseUrl,
      email: jiraCredentials.email,
      apiToken: jiraCredentials.apiToken,
      projectKeys: jiraCredentials.projectKeys ? jiraCredentials.projectKeys.split(',') : [],
    });

    // Normalize baseUrl (ensure it has https:// protocol)
    let normalizedBaseUrl = jiraCredentials.baseUrl.trim();
    if (!normalizedBaseUrl.match(/^https?:\/\//i)) {
      normalizedBaseUrl = `https://${normalizedBaseUrl}`;
    }

    // Validate API token BEFORE extraction
    console.log('[Token Validation] Starting API token validation...');
    console.log('[Token Validation] Using baseUrl:', normalizedBaseUrl);

    // Method 1: Try to get current user (most reliable for detecting bad tokens)
    let tokenValid = false;
    try {
      console.log('[Token Validation] Method 1: Checking /myself endpoint');
      const myselfResponse = await fetch(`${normalizedBaseUrl}/rest/api/3/myself`, {
        headers: {
          'Authorization': `Basic ${Buffer.from(`${jiraCredentials.email}:${jiraCredentials.apiToken}`).toString('base64')}`,
          'Accept': 'application/json'
        }
      });
      console.log(`[Token Validation] /myself returned status: ${myselfResponse.status}`);

      if (myselfResponse.ok) {
        const userData = await myselfResponse.json();
        console.log(`[Token Validation] ✓ Token VALID - authenticated as: ${userData.displayName || userData.emailAddress || userData.name}`);
        tokenValid = true;
      } else if (myselfResponse.status === 401) {
        console.error('[Token Validation] ✗ Token INVALID - 401 from /myself');
        return NextResponse.json({
          success: false,
          error: 'Authentication failed (HTTP 401). Your API token is invalid or expired. Please check your connection settings.'
        }, { status: 401 });
      } else if (myselfResponse.status === 403) {
        console.error('[Token Validation] ✗ Token lacks permission - 403 from /myself');
        return NextResponse.json({
          success: false,
          error: 'Access denied (HTTP 403). Your API token does not have permission to access this Jira instance.'
        }, { status: 403 });
      } else {
        console.warn(`[Token Validation] /myself returned unexpected status: ${myselfResponse.status}`);
      }
    } catch (e) {
      console.warn('[Token Validation] /myself endpoint check failed with exception:', e);
    }

    // If /myself didn't give us a definitive answer, try search
    if (!tokenValid) {
      console.log('[Token Validation] Method 2: Checking /search endpoint');
      try {
        const searchResponse = await fetch(`${normalizedBaseUrl}/rest/api/3/search`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${jiraCredentials.email}:${jiraCredentials.apiToken}`).toString('base64')}`,
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            jql: 'key = "NONEXISTENT-123"',
            maxResults: 1,
            fields: ['key']
          })
        });
        console.log(`[Token Validation] /search returned status: ${searchResponse.status}`);

        if (searchResponse.ok) {
          console.log('[Token Validation] ✓ Token appears valid (search succeeded)');
          tokenValid = true;
        } else if (searchResponse.status === 401) {
          console.error('[Token Validation] ✗ Token INVALID - 401 from /search');
          return NextResponse.json({
            success: false,
            error: 'Authentication failed (HTTP 401). Your API token is invalid or expired.'
          }, { status: 401 });
        } else if (searchResponse.status === 403) {
          console.error('[Token Validation] ✗ Token lacks permission - 403 from /search');
          return NextResponse.json({
            success: false,
            error: 'Access denied (HTTP 403). Your API token does not have permission to search issues.'
          }, { status: 403 });
        }
      } catch (e) {
        console.warn('[Token Validation] /search endpoint check failed with exception:', e);
      }
    }

    // If neither method could validate the token, we're in an ambiguous state
    if (!tokenValid) {
      console.warn('[Token Validation] ⚠ Could not validate token - Jira may allow anonymous access. Proceeding with extraction but results may be incomplete.');
      // Don't fail here - let the extraction proceed and we'll warn if we get 0 results
    }

    // Build JQL
    let finalJql = jql;
    if (!finalJql) {
      finalJql = client.buildDefaultJql({ dateFrom: effectiveDateFrom, dateTo: effectiveDateTo });
    }

    console.log(`Starting extraction for connection ${connectionRef} with JQL: ${finalJql}`);

    // Extract issues
    const issues = await client.extractIssues(finalJql, {
      maxResults: rateLimit?.batchSize || 50,
      expand: ['changelog'],
      delayMs: rateLimit?.delayMs || 0,
      backoffStrategy: rateLimit?.backoffStrategy || 'none',
      onProgress: (progress, total) => {
        console.log(`Extraction progress: ${progress}/${total} issues`);
      },
    });

    console.log(`Extraction completed: ${issues.length} issues extracted`);

    // Check if we should save this extraction
    const shouldSave = saveExtraction ?? true;

    // Prune old extractions for this connection to prevent DB bloat
    if (shouldSave && connectionRef) {
      const normalize = (j: string) => j.replace(/created\s*[<>]=\s*"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
      const currentTemplate = normalize(finalJql);

      const allRuns = await (db as any).etlRun.findMany({
        where: { connectionRef: connectionRef },
        select: { id: true, jql: true }
      });
      
      const runsToPrune = allRuns.filter((r: any) => normalize(r.jql || '') === currentTemplate);
      const oldRunIds = runsToPrune.map((r: any) => r.id);
      
      if (oldRunIds.length > 0) {
        // Cascading delete - ensure relations are handled
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

    // Get existing keys to track additions/updates
    const existingMasterTickets = await (db as any).masterTicket.findMany({
      where: { connectionRef: connectionRef },
      select: { jiraKey: true }
    });
    const existingKeys = new Set<string>(existingMasterTickets.map((t: any) => t.jiraKey as string));
    let addedCount = 0;
    let updatedCount = 0;
    const currentKeys = new Set(issues.map(i => i.key));

    // Create ETL run record
    const etlRun = await (db as any).etlRun.create({
      data: {
        connectionRef: connectionRef,
        status: 'completed',
        ticketsProcessed: issues.length,
        startedAt: new Date(),
        completedAt: new Date(),
        jql: finalJql,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        autoSave: shouldSave,
        sizeBytes: Buffer.byteLength(JSON.stringify(issues)),
        metadata: JSON.stringify({
          version: '1.1',
          extractParams: { jql: finalJql, dateFrom: effectiveDateFrom, dateTo: effectiveDateTo, daysBack },
        }),
      },
    });

    // Store ticket snapshots and transitions
    if (issues.length > 0) {
      await db.ticketSnapshot.createMany({
        data: issues.map((issue) => {
          const rawSp = (issue.fields as any)['customfield_10002'];
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

      const snapshots = await db.ticketSnapshot.findMany({ where: { etlRunId: etlRun.id } });
      const transitionData: any[] = [];
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
                author: history.author?.displayName || 'Unknown',
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

    // Update master dataset
    console.log('Updating master dataset...');
    for (const issue of issues) {
      if (existingKeys.has(issue.key)) {
        updatedCount++;
      } else {
        addedCount++;
      }

      const rawSp = (issue.fields as any)['customfield_10002'];
      const storyPoints = typeof rawSp === 'number' ? rawSp : (typeof rawSp === 'string' && !isNaN(parseFloat(rawSp)) ? parseFloat(rawSp) : null);

      await (db as any).masterTicket.upsert({
        where: { connectionRef_jiraKey: { connectionRef: connectionRef, jiraKey: issue.key } },
        create: {
          connectionRef: connectionRef,
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

    // Check for deleted tickets (only if JQL is project-wide without time filters)
    let deletedCount = 0;
    const isBroadSync = !finalJql.toLowerCase().includes('updated') && 
                       !finalJql.toLowerCase().includes('created') && 
                       !finalJql.toLowerCase().includes('resolved');
    
    if (isBroadSync) {
      const keysToRemove = Array.from(existingKeys).filter(k => !currentKeys.has(k));
      deletedCount = keysToRemove.length;
      
      if (deletedCount > 0) {
        console.log(`Detected ${deletedCount} deleted/removed tickets. Removing from master dataset.`);
        await (db as any).masterTicket.deleteMany({
          where: { 
            connectionRef: connectionRef,
            jiraKey: { in: keysToRemove }
          }
        });
      }
    }

    // --- AUTO-KPI CALCULATION ---
    console.log('Running auto-KPI calculation...');
    const engine = getKpiEngine();
    
    // Register custom plugins if provided
    if (customPlugins && Array.isArray(customPlugins)) {
      for (const plugin of customPlugins) {
        if (plugin.pluginType === 'custom' && plugin.formula) {
          engine.registerCustomPlugin({
            id: plugin.id,
            name: plugin.name,
            description: plugin.description || '',
            category: plugin.category || 'custom',
            unit: plugin.unit || '',
            formula: plugin.formula
          });
        }
      }
    }

    // Use master tickets for calculation to ensure full dataset
    const masterTickets = await (db as any).masterTicket.findMany({ where: { connectionRef: connectionRef } });
    const allIssues = masterTickets.map((t: any) => JSON.parse(t.rawData));

    // Define period for KPI
    const period = {
      start: effectiveDateFrom ? new Date(effectiveDateFrom) : new Date(0),
      end: effectiveDateTo ? new Date(effectiveDateTo) : new Date()
    };

    const holidays = {
      regions: [generalSettings?.defaultHolidayState || 'national'] as any[],
      workStartHour: generalSettings?.workStartHour || 9,
      workEndHour: generalSettings?.workEndHour || 17,
      slaTargetHours: generalSettings?.defaultSlaTargetHours || 40,
    };

    const kpiResults = engine.calculateAll(allIssues, holidays, period);

    // Persist KPI results
    const kpiData: any[] = [];
    for (const [kpiId, results] of Object.entries(kpiResults)) {
      const plugin = engine.getPlugin(kpiId);
      for (const res of results) {
        kpiData.push({
          connectionRef: connectionRef,
          etlRunId: etlRun.id,
          kpiId: kpiId,
          kpiName: plugin?.name || res.name,
          value: res.value,
          unit: res.unit || plugin?.unit || '',
          dimensions: JSON.stringify(res.dimensions || {}),
          periodStart: period.start,
          periodEnd: period.end,
        });
      }
    }

    if (kpiData.length > 0) {
      await (db as any).kpiResult.createMany({ data: kpiData });
    }

    return NextResponse.json({
      success: true,
      etlRunId: etlRun.id,
      summary: {
        totalExtracted: issues.length,
        added: addedCount,
        updated: updatedCount,
        deleted: deletedCount,
        jql: finalJql,
        timestamp: new Date().toISOString(),
        effectiveDateFrom,
        effectiveDateTo,
      },
      issues: issues
    });

  } catch (error) {
    console.error('Extract error:', error);
    return NextResponse.json({ success: false, error: (error as any).message }, { status: 500 });
  }
}
