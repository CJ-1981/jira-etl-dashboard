import { NextResponse } from 'next/server';
import { JiraClient } from '@/lib/jira/client';
import { getDb } from '@/lib/db';
import { getKpiEngine } from '@/lib/kpi/engine';

export async function POST(request: Request) {
  try {
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return NextResponse.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
    }

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

    // Build JQL
    let finalJql = jql;
    if (!finalJql) {
      finalJql = client.buildDefaultJql({ dateFrom: effectiveDateFrom, dateTo: effectiveDateTo });
    }

    console.log(`[Extract API] Starting extraction for connection ${connectionRef} with JQL: ${finalJql}`);

    // Extract issues
    const issues = await client.extractIssues(finalJql, {
      maxResults: rateLimit?.batchSize || 50,
      expand: ['changelog'],
      delayMs: rateLimit?.delayMs || 0,
      backoffStrategy: rateLimit?.backoffStrategy || 'none',
      onProgress: (progress, total) => {
        console.log(`[Extract API] Progress: ${progress}/${total} issues`);
      },
    });

    console.log(`[Extract API] Completed: ${issues.length} issues extracted`);

    // Check if we should save this extraction
    const shouldSave = saveExtraction ?? true;

    // Prune old extractions for this connection to prevent DB bloat
    if (shouldSave && connectionRef) {
      try {
        const normalize = (j: string) => j.replace(/created\s*[<>]=\s*"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
        const currentTemplate = normalize(finalJql);

        const allRuns = await (db as any).etlRun.findMany({
          where: { connectionRef: connectionRef },
          select: { id: true, jql: true }
        });
        
        const runsToPrune = allRuns.filter((r: any) => normalize(r.jql || '') === currentTemplate);
        const oldRunIds = runsToPrune.map((r: any) => r.id);
        
        if (oldRunIds.length > 0) {
          console.log(`[Extract API] Pruning ${oldRunIds.length} old extractions...`);
          
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
      } catch (pruneError) {
        console.warn('[Extract API] Pruning failed, but continuing:', pruneError);
      }
    }

    // Get existing keys and timestamps to track additions/updates/unchanged
    const existingMasterTickets = await (db as any).masterTicket.findMany({
      where: { connectionRef: connectionRef },
      select: { jiraKey: true, updated: true }
    });
    
    const existingMap = new Map<string, Date>();
    existingMasterTickets.forEach((t: any) => {
      if (t.jiraKey) existingMap.set(t.jiraKey, t.updated);
    });
    
    let addedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
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
          version: '1.2',
          extractParams: { jql: finalJql, dateFrom: effectiveDateFrom, dateTo: effectiveDateTo, daysBack },
        }),
      },
    });

    // Store ticket snapshots and transitions
    if (issues.length > 0) {
      console.log(`[Extract API] Storing ${issues.length} ticket snapshots...`);
      
      const snapshotData = issues.map((issue) => {
        const fields = issue.fields || {};
        const rawSp = (fields as any)['customfield_10002'];
        const storyPoints = typeof rawSp === 'number' ? rawSp : (typeof rawSp === 'string' && !isNaN(parseFloat(rawSp)) ? parseFloat(rawSp) : null);

        return {
          etlRunId: etlRun.id,
          jiraKey: issue.key,
          summary: fields.summary || 'No Summary',
          issueType: fields.issuetype?.name || 'Task',
          priority: fields.priority?.name || 'Medium',
          status: fields.status?.name || 'Unknown',
          assignee: fields.assignee?.displayName || 'Unassigned',
          reporter: fields.reporter?.displayName || 'Unknown',
          created: fields.created ? new Date(fields.created) : new Date(),
          updated: fields.updated ? new Date(fields.updated) : new Date(),
          resolved: fields.resolutiondate ? new Date(fields.resolutiondate) : null,
          dueDate: fields.duedate ? new Date(fields.duedate) : null,
          storyPoints,
          labels: JSON.stringify(fields.labels || []),
          components: JSON.stringify(fields.components?.map((c: any) => c.name) || []),
        };
      });

      // Use a loop if createMany fails, but for SQLite it should work in current Prisma
      try {
        await (db as any).ticketSnapshot.createMany({ data: snapshotData });
      } catch (err) {
        console.warn('[Extract API] createMany failed, falling back to sequential create:', err);
        for (const data of snapshotData) {
          await (db as any).ticketSnapshot.create({ data });
        }
      }

      const snapshots = await (db as any).ticketSnapshot.findMany({ where: { etlRunId: etlRun.id } });
      const transitionData: any[] = [];
      
      for (let i = 0; i < issues.length; i++) {
        const issue = issues[i];
        const snapshot = snapshots.find(s => s.jiraKey === issue.key);
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
        try {
          await (db as any).ticketTransition.createMany({ data: transitionData });
        } catch (err) {
          for (const data of transitionData) {
            await (db as any).ticketTransition.create({ data });
          }
        }
      }
    }

    // Update master dataset
    console.log('[Extract API] Updating master dataset...');
    for (const issue of issues) {
      const fields = issue.fields || {};
      const existingUpdated = existingMap.get(issue.key);
      
      if (existingUpdated) {
        const jiraUpdated = fields.updated ? new Date(fields.updated) : new Date();
        if (existingUpdated.getTime() === jiraUpdated.getTime()) {
          unchangedCount++;
        } else {
          updatedCount++;
        }
      } else {
        addedCount++;
      }

      const rawSp = (fields as any)['customfield_10002'];
      const storyPoints = typeof rawSp === 'number' ? rawSp : (typeof rawSp === 'string' && !isNaN(parseFloat(rawSp)) ? parseFloat(rawSp) : null);

      await (db as any).masterTicket.upsert({
        where: { connectionRef_jiraKey: { connectionRef: connectionRef, jiraKey: issue.key } },
        create: {
          connectionRef: connectionRef,
          jiraKey: issue.key,
          summary: fields.summary || 'No Summary',
          issueType: fields.issuetype?.name || 'Task',
          priority: fields.priority?.name || 'Medium',
          status: fields.status?.name || 'Unknown',
          assignee: fields.assignee?.displayName || 'Unassigned',
          reporter: fields.reporter?.displayName || 'Unknown',
          created: fields.created ? new Date(fields.created) : new Date(),
          updated: fields.updated ? new Date(fields.updated) : new Date(),
          resolved: fields.resolutiondate ? new Date(fields.resolutiondate) : null,
          dueDate: fields.duedate ? new Date(fields.duedate) : null,
          storyPoints: storyPoints,
          labels: JSON.stringify(fields.labels || []),
          components: JSON.stringify(fields.components?.map((c: any) => c.name) || []),
          rawData: JSON.stringify(issue),
        },
        update: {
          summary: fields.summary || 'No Summary',
          issueType: fields.issuetype?.name || 'Task',
          priority: fields.priority?.name || 'Medium',
          status: fields.status?.name || 'Unknown',
          assignee: fields.assignee?.displayName || 'Unassigned',
          reporter: fields.reporter?.displayName || 'Unknown',
          updated: fields.updated ? new Date(fields.updated) : new Date(),
          resolved: fields.resolutiondate ? new Date(fields.resolutiondate) : null,
          dueDate: fields.duedate ? new Date(fields.duedate) : null,
          storyPoints: storyPoints,
          labels: JSON.stringify(fields.labels || []),
          components: JSON.stringify(fields.components?.map((c: any) => c.name) || []),
          rawData: JSON.stringify(issue),
          lastUpdatedAt: new Date()
        }
      });
    }

    // Deletion detection
    let deletedCount = 0;
    const lowerJql = finalJql.toLowerCase();
    const isBroadSync = !lowerJql.includes('updated') && 
                       !lowerJql.includes('created') && 
                       !lowerJql.includes('resolved');
    
    if (isBroadSync) {
      const existingKeys = Array.from(existingMap.keys());
      const keysToRemove = existingKeys.filter(k => !currentKeys.has(k));
      deletedCount = keysToRemove.length;
      
      if (deletedCount > 0) {
        console.log(`[Extract API] Removing ${deletedCount} deleted tickets in broad sync.`);
        await (db as any).masterTicket.deleteMany({
          where: { connectionRef: connectionRef, jiraKey: { in: keysToRemove } }
        });
      }
    } else if (effectiveDateFrom) {
      let dateField = 'created';
      if (lowerJql.includes('updated')) dateField = 'updated';
      else if (lowerJql.includes('resolved')) dateField = 'resolved';

      const startDate = new Date(effectiveDateFrom);
      const endDate = effectiveDateTo ? new Date(new Date(effectiveDateTo).setHours(23, 59, 59, 999)) : new Date();

      const dbTicketsInPeriod = await (db as any).masterTicket.findMany({
        where: {
          connectionRef: connectionRef,
          [dateField]: { gte: startDate, lte: endDate }
        },
        select: { jiraKey: true }
      });

      const periodKeys = dbTicketsInPeriod.map((t: any) => t.jiraKey);
      const keysToRemove = periodKeys.filter((k: string) => !currentKeys.has(k));
      deletedCount = keysToRemove.length;

      if (deletedCount > 0) {
        console.log(`[Extract API] Removing ${deletedCount} deleted tickets for period.`);
        await (db as any).masterTicket.deleteMany({
          where: { connectionRef: connectionRef, jiraKey: { in: keysToRemove } }
        });
      }
    }

    // Auto-KPI calculation
    try {
      console.log('[Extract API] Running KPI calculation...');
      const engine = getKpiEngine();
      
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

      const masterTickets = await (db as any).masterTicket.findMany({ where: { connectionRef: connectionRef } });
      const allIssues = masterTickets.map((t: any) => {
        try { return JSON.parse(t.rawData); } catch (e) { return null; }
      }).filter(Boolean);

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
    } catch (kpiError) {
      console.error('[Extract API] KPI calculation failed:', kpiError);
    }

    return NextResponse.json({
      success: true,
      etlRunId: etlRun.id,
      summary: {
        totalExtracted: issues.length,
        added: addedCount,
        updated: updatedCount,
        unchanged: unchangedCount,
        deleted: deletedCount,
        jql: finalJql,
        timestamp: new Date().toISOString(),
        effectiveDateFrom,
        effectiveDateTo,
      },
      issues: issues
    });

  } catch (error) {
    console.error('[Extract API] Critical error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
}
