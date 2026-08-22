import { NextResponse } from 'next/server';
import { extractSelectFieldValue } from '@/lib/jira/client';
import { JiraClient } from '@/lib/jira/client';
import { getIssueOwnerTeamField, getStoryPointsField } from '@/lib/jira/field-config';
import { getDb } from '@/lib/db';
import { getKpiEngine } from '@/lib/kpi/engine';
import { isLoopbackOriginRequest } from '@/lib/security';

// Constants for sizeBytes estimation
// @MX:NOTE: These are heuristic estimates for storage sizing, not exact byte measurements
const EST_FIELD_BYTES_PER_KEY = 50; // Average bytes per field key-value pair
const EST_CHANGE_HISTORY_BYTES = 200; // Average bytes per changelog history entry
const FIXED_OVERHEAD_BYTES = 100; // Fixed overhead per issue (metadata, etc.)

export async function POST(request: Request) {
  if (!isLoopbackOriginRequest(request)) {
    return NextResponse.json(
      { success: false, error: 'Cross-origin request rejected' },
      { status: 401 }
    );
  }

  // Hoisted so the outer catch can mark a created run as failed
  let db: any = null;
  let etlRun: any = null;
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
      customFieldIds,
      storyPointsFieldId,
      issueOwnerTeamFieldId,
      jql, 
      dateFrom, 
      dateTo, 
      daysBack, 
      saveExtraction,
      storageConfig,
      updateOnly
    } = body;

    db = getDb(storageConfig);

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

    const storyPointsFieldKey = storyPointsFieldId || getStoryPointsField();
    const teamFieldKey = issueOwnerTeamFieldId || getIssueOwnerTeamField();

    const client = new JiraClient({
      baseUrl: jiraCredentials.baseUrl,
      email: jiraCredentials.email,
      apiToken: jiraCredentials.apiToken,
      projectKeys: jiraCredentials.projectKeys ? jiraCredentials.projectKeys.split(',') : [],
    }, {
      storyPointsField: storyPointsFieldKey,
      issueOwnerTeamField: teamFieldKey
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
          // @MX:NOTE: For JQL date strings, we use the "next day and <" pattern to ensure inclusivity.
          let dateToStr = effectiveDateTo;
          if (effectiveDateTo) {
             const d = new Date(effectiveDateTo);
             const nextDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
             dateToStr = nextDay.toISOString().slice(0, 10);
          }
          finalJql = `${projectClause}updated >= "${effectiveDateFrom}"${dateToStr ? ` AND updated < "${dateToStr}"` : ''} ORDER BY updated DESC`;
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
      customFieldIds: customFieldIds || [],
      delayMs: rateLimit?.delayMs || 0,
      backoffStrategy: rateLimit?.backoffStrategy || 'none',
      onProgress: (progress, total) => {
        console.log(`[Extract API] Progress: ${progress}/${total}`);
      },
    });

    console.log(`[Extract API] Extracted: ${issues.length} issues`);

    const shouldSave = saveExtraction ?? true;

    // @MX:NOTE: Pruning of old extractions is deferred until AFTER the new data is loaded
    // successfully (see below). Pruning before the write could destroy run history if the
    // extraction fails mid-run.

    // Get existing keys and timestamps
    const existingMasterTickets = await (db as any).masterTicket.findMany({
      where: { connectionRef: connectionRef },
      select: { jiraKey: true, updated: true }
    });
    
    const existingMap = new Map<string, Date>();
    existingMasterTickets.forEach((t: any) => {
      if (t.jiraKey) existingMap.set(t.jiraKey, t.updated);
    });
    
    etlRun = await (db as any).etlRun.create({
      data: {
        connectionRef: connectionRef,
        // @MX:NOTE: Run starts as 'extracting' and is promoted to 'completed' only after the
        // load succeeds. This prevents a mid-run failure from leaving a 'completed' run behind.
        status: 'extracting',
        ticketsProcessed: issues.length,
        startedAt: new Date(),
        completedAt: null,
        jql: finalJql,
        dateFrom: effectiveDateFrom,
        dateTo: effectiveDateTo,
        autoSave: shouldSave,
        // @MX:NOTE: This is a heuristic estimate for storage sizing, derived from field count and changelog length
        // @MX:WARN: Semantic change from real byte length to estimate - this is an approximation, not exact measurement
        // @MX:REASON: Calculating actual JSON.stringify() byte length on every issue is expensive; heuristics provide sufficient accuracy for capacity planning
        sizeBytes: issues.reduce((acc, issue) => {
          const fields = issue.fields || {};
          const estFieldSize = Object.keys(fields).length * EST_FIELD_BYTES_PER_KEY;
          const changelogSize = (issue.changelog?.histories?.length ?? 0) * EST_CHANGE_HISTORY_BYTES;
          return acc + issue.key.length + estFieldSize + changelogSize + FIXED_OVERHEAD_BYTES;
        }, 0),
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
        const rawSp = (fields as any)[storyPointsFieldKey];
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
        // createMany may not support all drivers — fall back to a single transaction
        await (db as any).$transaction(
          snapshotData.map((data: any) => (db as any).ticketSnapshot.create({ data }))
        );
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
          await (db as any).$transaction(
            transitionData.map((data: any) => (db as any).ticketTransition.create({ data }))
          );
        }
      }

      // 2. Update Master Dataset — batch all upserts into ONE transaction per chunk
      //    Individual prisma.upsert() calls each open their own SQLite write transaction,
      //    causing lock contention and P1008 socket timeouts on large datasets.
      const masterRows = chunk.map(issue => {
        const fields = issue.fields || {};
        const existingUpdated = existingMap.get(issue.key);

        if (existingUpdated) {
          const jiraUpdated = fields.updated ? new Date(fields.updated) : new Date();
          if (existingUpdated.getTime() === jiraUpdated.getTime()) unchangedCount++;
          else updatedCount++;
        } else {
          addedCount++;
        }

        const rawSp = (fields as any)[storyPointsFieldKey];
        const storyPoints = typeof rawSp === 'number' ? rawSp
          : (typeof rawSp === 'string' && !isNaN(parseFloat(rawSp)) ? parseFloat(rawSp) : null);

        const issueOwnerTeam = (fields && teamFieldKey in fields && (fields as any)[teamFieldKey] !== undefined)
          ? extractSelectFieldValue((fields as any)[teamFieldKey]) || null
          : null;

        return {
          connectionRef,
          jiraKey: issue.key,
          summary: fields.summary || 'No Summary',
          issueType: fields.issuetype?.name || 'Task',
          priority: fields.priority?.name || 'Medium',
          status: fields.status?.name || 'Unknown',
          assignee: fields.assignee?.displayName || 'Unassigned',
          reporter: fields.reporter?.displayName || 'Unknown',
          issueOwnerTeam,
          created: fields.created ? new Date(fields.created) : new Date(),
          updated: fields.updated ? new Date(fields.updated) : new Date(),
          resolved: fields.resolutiondate ? new Date(fields.resolutiondate) : null,
          dueDate: fields.duedate ? new Date(fields.duedate) : null,
          storyPoints,
          labels: JSON.stringify(fields.labels || []),
          components: JSON.stringify(fields.components?.map((c: any) => c.name) || []),
          rawData: JSON.stringify(issue),
          lastUpdatedAt: new Date(),
        };
      });

      // Execute all upserts in a single transaction — O(1) lock acquisitions vs O(N)
      await (db as any).$transaction(
        masterRows.map(row =>
          (db as any).masterTicket.upsert({
            where: { connectionRef_jiraKey: { connectionRef: row.connectionRef, jiraKey: row.jiraKey } },
            create: {
              ...row,
              firstSeenAt: new Date(),
            },
            update: {
              summary: row.summary,
              issueType: row.issueType,
              priority: row.priority,
              status: row.status,
              assignee: row.assignee,
              reporter: row.reporter,
              issueOwnerTeam: row.issueOwnerTeam,
              updated: row.updated,
              resolved: row.resolved,
              dueDate: row.dueDate,
              storyPoints: row.storyPoints,
              labels: row.labels,
              components: row.components,
              rawData: row.rawData,
              lastUpdatedAt: row.lastUpdatedAt,
            },
          })
        )
      );
    }

    // Deletion detection
    // @MX:NOTE: Only treat a field as date-bounded when it appears as an actual JQL field
    // operand (e.g. `updated >= ...` / `created BETWEEN ...`). Substring matching previously
    // false-positived on project keys, labels, and text values containing these words.
    const DATE_FIELD_OPERAND_RE = /\b(created|updated|resolved(date)?)\s*(>=|<=|>|<|=|BETWEEN)/i;
    let deletedCount = 0;
    const currentKeys = new Set(issues.map(i => i.key));
    const dateFieldMatch = finalJql.match(DATE_FIELD_OPERAND_RE);
    const isBroadSync = !dateFieldMatch;

    // Skip deletion detection in update-only mode
    if (!updateOnly) {
      if (isBroadSync && !jql) {
        const existingKeys = Array.from(existingMap.keys());
        const keysToRemove = existingKeys.filter(k => !currentKeys.has(k));
        deletedCount = keysToRemove.length;
        if (deletedCount > 0) {
          await (db as any).masterTicket.deleteMany({
            where: { connectionRef: connectionRef, jiraKey: { in: keysToRemove } }
          });
        }
      } else if (isBroadSync) {
        // Custom JQL without a recognizable date window: the extraction may cover only a subset
        // of the connection's tickets, so missing keys are not necessarily deleted upstream.
        console.log('[Extract API] Skipping deletion detection: custom JQL in use; deletion is intentionally conservative.');
      } else if (effectiveDateFrom && !jql) {
        // @MX:NOTE: Scoped deletion is only safe for the app-generated broad-sync JQL, where the
        // date window and the extracted key set are known to line up. For user-provided custom JQL
        // the extraction may intentionally cover a subset, so missing keys are not deletions.
        let dateField = 'created';
        if (/updated/i.test(dateFieldMatch![1])) dateField = 'updated';
        else if (/resolved/i.test(dateFieldMatch![1])) dateField = 'resolved';

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
      } else if (effectiveDateFrom) {
        console.log('[Extract API] Skipping deletion detection: custom JQL with a date window in use; deletion is intentionally conservative.');
      }
    }

    // Optimized KPI calculation - avoid loading everything at once if possible
    try {
      console.log('[Extract API] Running KPI calculation...');
      const engine = getKpiEngine();
      
      // Load and parse master tickets — filter by date range to reduce memory
      const dateFilter: any = {};
      if (effectiveDateFrom) {
        dateFilter.gte = new Date(effectiveDateFrom);
      }
      if (effectiveDateTo) {
        const endOfDateTo = new Date(new Date(effectiveDateTo).setHours(23, 59, 59, 999));
        dateFilter.lte = endOfDateTo;
      }

      const whereClause: any = { connectionRef: connectionRef };
      if (Object.keys(dateFilter).length > 0) {
        // Fetch issues created, resolved, or updated within the period, OR long-lived open tickets
        whereClause.OR = [
          { created: dateFilter },
          { resolved: dateFilter },
          { updated: dateFilter },
          { created: { lte: dateFilter.lte }, resolved: null }, // long-lived open tickets
        ];
      }

      const masterTickets = await (db as any).masterTicket.findMany({ 
        where: whereClause,
        select: { rawData: true }
      });
      
      const allIssues: any[] = [];
      for (const t of masterTickets) {
        try {
          allIssues.push(JSON.parse(t.rawData));
        } catch (e) {
          // Log parse failures with ticket identifier for debugging
          const ticketId = (t as any).id || 'unknown';
          console.warn(`[Extract API] Failed to parse ticket ${ticketId}:`, e);
        }
      }

      const period = {
        start: effectiveDateFrom ? new Date(effectiveDateFrom) : new Date(0),
        // @MX:NOTE: Ensure end date is inclusive by setting it to the very end of the day (23:59:59)
        end: effectiveDateTo ? new Date(new Date(effectiveDateTo).setHours(23, 59, 59, 999)) : new Date()
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

    // All data written successfully — promote the run to 'completed'
    await (db as any).etlRun.update({
      where: { id: etlRun.id },
      data: { status: 'completed', completedAt: new Date() },
    });

    // Prune old extractions AFTER successful load so a mid-run failure never destroys history.
    // Optimization: limited pruning scope. Skipped in update-only mode to preserve incremental runs.
    if (shouldSave && connectionRef && !updateOnly) {
      try {
        const normalize = (j: string) => j.replace(/created\s*[<>]=\s*"[^"]*"/g, '').replace(/\s+/g, ' ').trim();
        const currentTemplate = normalize(finalJql);

        const allRuns = await (db as any).etlRun.findMany({
          where: { connectionRef: connectionRef, id: { not: etlRun.id } },
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
    // If the run row was already created, mark it failed so it never stays 'extracting'
    // nor masquerades as a completed run.
    if (etlRun && db) {
      try {
        await (db as any).etlRun.update({
          where: { id: etlRun.id },
          data: {
            status: 'failed',
            errorLog: error instanceof Error ? error.message : String(error),
            completedAt: new Date(),
          },
        });
      } catch (markFailedError) {
        console.error('[Extract API] Failed to mark ETL run as failed:', markFailedError);
      }
    }
    // Preserve the upstream Jira HTTP status (401/403/429/5xx) so the client
    // can show a tailored toast; fall back to 500 for unexpected errors.
    const httpStatus = (error as any)?.status ?? 500;
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: httpStatus });
  }
}
