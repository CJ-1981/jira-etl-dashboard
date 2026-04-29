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
      storageConfig,
      updateOnly
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

    // Normalize baseUrl
    let normalizedBaseUrl = jiraCredentials.baseUrl.trim();
    if (!normalizedBaseUrl.match(/^https?:\/\//i)) {
      normalizedBaseUrl = `https://${normalizedBaseUrl}`;
    }

    // Build JQL
    let finalJql = jql;
    if (!finalJql) {
      if (updateOnly) {
        // Special JQL for update only using 'updated' field instead of 'created'
        const validKeys = (jiraCredentials.projectKeys ? jiraCredentials.projectKeys.split(',') : [])
          .filter((k: string) => k && k.trim() !== '' && k.trim() !== '*');
        const projectClause = validKeys.length > 0 
          ? `(${validKeys.map((key: string) => `project = "${key.trim()}"`).join(' OR ')}) AND `
          : '';
        
        if (daysBack) {
          finalJql = `${projectClause}updated > -${daysBack}d ORDER BY updated DESC`;
        } else if (effectiveDateFrom) {
          finalJql = `${projectClause}updated >= "${effectiveDateFrom}"${effectiveDateTo ? ` AND updated <= "${effectiveDateTo}"` : ''} ORDER BY updated DESC`;
        } else {
          // Fallback to default if no dates provided
          finalJql = client.buildDefaultJql({ dateFrom: effectiveDateFrom, dateTo: effectiveDateTo });
        }
      } else {
        finalJql = client.buildDefaultJql({ dateFrom: effectiveDateFrom, dateTo: effectiveDateTo });
      }
    }

    console.log(`[Extract API] Starting extraction for ${connectionRef} (JQL: ${finalJql.substring(0, 100)}...)${updateOnly ? ' [UPDATE ONLY MODE]' : ''}`);

    // Extract issues
    const issues = await client.extractIssues(finalJql, {
      maxResults: rateLimit?.batchSize || 50,
      expand: ['changelog'],
      delayMs: rateLimit?.delayMs || 0,
      backoffStrategy: rateLimit?.backoffStrategy || 'none',
      onProgress: (progress, total) => {
        console.log(`[Extract API] Progress: ${progress}/${total}`);
      },
    });

    console.log(`[Extract API] Extracted: ${issues.length} issues`);

    const shouldSave = saveExtraction ?? true;

    // Prune old extractions - Optimization: limited pruning scope
    // Skip pruning in update-only mode to preserve incremental run history
    if (shouldSave && connectionRef && !updateOnly) {
      try {
        const normalize = (j: string) => j.replace(/created\s*[<>]=\s*"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
        const currentTemplate = normalize(finalJql);

        const allRuns = await (db as any).etlRun.findMany({
          where: { connectionRef: connectionRef },
          select: { id: true, jql: true },
          take: 50 // Only look at recent runs to prune
        });
        
        const runsToPrune = allRuns.filter((r: any) => normalize(r.jql || '') === currentTemplate);
        const oldRunIds = runsToPrune.map((r: any) => r.id);
        
        if (oldRunIds.length > 0) {
          console.log(`[Extract API] Pruning ${oldRunIds.length} old runs...`);
          // Note: Many DBs handle cascading via schema, but we do it manually for SQLite safety
          const snapshotIds = await (db as any).ticketSnapshot.findMany({
            where: { etlRunId: { in: oldRunIds } },
            select: { id: true }
          });
          
          if (snapshotIds.length > 0) {
            await (db as any).ticketTransition.deleteMany({
              where: { ticketSnapshotId: { in: snapshotIds.map((s: any) => s.id) } }
            });
          }
          await (db as any).ticketSnapshot.deleteMany({ where: { etlRunId: { in: oldRunIds } } });
          await (db as any).kpiResult.deleteMany({ where: { etlRunId: { in: oldRunIds } } });
          await (db as any).etlRun.deleteMany({ where: { id: { in: oldRunIds } } });
        }
      } catch (pruneError) {
        console.warn('[Extract API] Pruning failed:', pruneError);
      }
    }

    // Get existing keys and timestamps
    const existingMasterTickets = await (db as any).masterTicket.findMany({
      where: { connectionRef: connectionRef },
      select: { jiraKey: true, updated: true }
    });
    
    const existingMap = new Map<string, Date>();
    existingMasterTickets.forEach((t: any) => {
      if (t.jiraKey) existingMap.set(t.jiraKey, t.updated);
    });
    
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
          version: '1.3',
          extractParams: { jql: finalJql, dateFrom: effectiveDateFrom, dateTo: effectiveDateTo, daysBack },
        }),
      },
    });

    // Chunked processing for database stability
    const CHUNK_SIZE = 100;
    let addedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;

    console.log(`[Extract API] Processing ${issues.length} issues in chunks of ${CHUNK_SIZE}...`);

    for (let i = 0; i < issues.length; i += CHUNK_SIZE) {
      const chunk = issues.slice(i, i + CHUNK_SIZE);
      console.log(`[Extract API] Processing chunk ${Math.floor(i / CHUNK_SIZE) + 1}...`);

      // 1. Store Snapshots
      const snapshotData = chunk.map((issue) => {
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

      try {
        await (db as any).ticketSnapshot.createMany({ data: snapshotData });
      } catch (err) {
        for (const data of snapshotData) { await (db as any).ticketSnapshot.create({ data }); }
      }

      const snapshots = await (db as any).ticketSnapshot.findMany({ 
        where: { etlRunId: etlRun.id, jiraKey: { in: chunk.map(c => c.key) } } 
      });

      const transitionData: any[] = [];
      for (const issue of chunk) {
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
          for (const data of transitionData) { await (db as any).ticketTransition.create({ data }); }
        }
      }

      // 2. Update Master Dataset in smaller batches to avoid lock contention
      for (const issue of chunk) {
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
    }

    // Deletion detection
    let deletedCount = 0;
    const currentKeys = new Set(issues.map(i => i.key));
    const lowerJql = finalJql.toLowerCase();
    const isBroadSync = !lowerJql.includes('updated') && !lowerJql.includes('created') && !lowerJql.includes('resolved');
    
    // Skip deletion detection in update-only mode
    if (!updateOnly) {
      if (isBroadSync) {
        const existingKeys = Array.from(existingMap.keys());
        const keysToRemove = existingKeys.filter(k => !currentKeys.has(k));
        deletedCount = keysToRemove.length;
        if (deletedCount > 0) {
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
          where: { connectionRef: connectionRef, [dateField]: { gte: startDate, lte: endDate } },
          select: { jiraKey: true }
        });

        const periodKeys = dbTicketsInPeriod.map((t: any) => t.jiraKey);
        const keysToRemove = periodKeys.filter((k: string) => !currentKeys.has(k));
        deletedCount = keysToRemove.length;

        if (deletedCount > 0) {
          await (db as any).masterTicket.deleteMany({
            where: { connectionRef: connectionRef, jiraKey: { in: keysToRemove } }
          });
        }
      }
    }

    // Optimized KPI calculation - avoid loading everything at once if possible
    try {
      console.log('[Extract API] Running KPI calculation...');
      const engine = getKpiEngine();
      
      // Load and parse master tickets in chunks or at least be careful with memory
      const masterTickets = await (db as any).masterTicket.findMany({ 
        where: { connectionRef: connectionRef },
        select: { rawData: true } // Only fetch rawData to save memory
      });
      
      const allIssues = masterTickets.map((t: any) => {
        try { return JSON.parse(t.rawData); } catch (e) { return null; }
      }).filter(Boolean);

      const period = {
        start: effectiveDateFrom ? new Date(effectiveDateFrom) : new Date(0),
        end: effectiveDateTo ? new Date(effectiveDateTo) : new Date()
      };

      const holidayConfig = {
        regions: [generalSettings?.defaultHolidayState || 'national'] as any[],
        workStartHour: generalSettings?.workStartHour || 9,
        workEndHour: generalSettings?.workEndHour || 17,
        slaTargetHours: generalSettings?.defaultSlaTargetHours || 40,
      };

      const kpiResults = engine.calculateAll(allIssues, holidayConfig, period);

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
        // Chunk KPI inserts
        for (let i = 0; i < kpiData.length; i += CHUNK_SIZE) {
          await (db as any).kpiResult.createMany({ data: kpiData.slice(i, i + CHUNK_SIZE) });
        }
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
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
