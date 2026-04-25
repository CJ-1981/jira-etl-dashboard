import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';
import type { JiraIssue } from '@/lib/jira/client';
import {
  pushKpiToMetabase,
  triggerMetabaseSync,
  type MetabaseConnectionConfig,
} from '@/lib/metabase/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode = 'upload', metabaseCredentials } = body;

    if (!metabaseCredentials || !metabaseCredentials.baseUrl || !metabaseCredentials.username || !metabaseCredentials.password) {
      return NextResponse.json(
        { success: false, error: 'Metabase credentials are required' },
        { status: 400 }
      );
    }

    const config: MetabaseConnectionConfig = {
      baseUrl: metabaseCredentials.baseUrl,
      username: metabaseCredentials.username,
      password: metabaseCredentials.password,
      apiKey: metabaseCredentials.apiKey,
    };

    // ── Sync-only mode ──
    if (mode === 'sync') {
      const { databaseId, fullSync } = body;
      if (!databaseId) {
        return NextResponse.json(
          { success: false, error: 'databaseId is required for sync mode' },
          { status: 400 }
        );
      }

      const syncResult = await triggerMetabaseSync(config, databaseId, { fullSync });
      return NextResponse.json({
        success: syncResult.success,
        message: syncResult.message,
        triggeredAt: syncResult.triggeredAt,
      });
    }

    // ── Upload mode (default) ──
    const { issues, holidays, dateFrom, dateTo, exportDataType = 'kpi' } = body;

    if (!issues || !Array.isArray(issues) || issues.length === 0) {
      return NextResponse.json(
        { success: false, error: 'issues array is required for upload mode' },
        { status: 400 }
      );
    }

    let csvData = '';
    const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
    const end = dateTo ? new Date(dateTo) : new Date();

    if (exportDataType === 'tickets') {
      // Build Raw Tickets CSV
      const headers = ['key', 'summary', 'status', 'priority', 'issuetype', 'created', 'resolved', 'assignee', 'project'];
      const rows: string[] = [headers.join(',')];
      
      for (const i of issues as JiraIssue[]) {
        const fields = i.fields || {};
        rows.push([
          i.key,
          `"${(fields.summary || '').replace(/"/g, '""')}"`,
          fields.status?.name || '',
          fields.priority?.name || '',
          fields.issuetype?.name || '',
          fields.created || '',
          fields.resolutiondate || '',
          fields.assignee?.displayName || '',
          i.key.split('-')[0]
        ].join(','));
      }
      csvData = rows.join('\n');
    } else {
      // Calculate KPIs
      const engine = getKpiEngine();
      const regions = holidays?.regions || [];

      const allResults = engine.calculateAll(issues as JiraIssue[], { regions }, { start, end });

      // Build KPI CSV
      const rows: string[] = [
        'kpi_id,kpi_name,value,unit,calculated_at,period_start,period_end,region,priority,status,is_detail',
      ];
      for (const [pluginId, results] of Object.entries(allResults)) {
        for (const result of results) {
          const dims = result.dimensions || {};
          rows.push(
            [
              pluginId,
              `"${result.name}"`,
              result.value,
              result.unit,
              new Date().toISOString(),
              start.toISOString(),
              end.toISOString(),
              regions.join(','),
              dims.priority || '',
              dims.status || '',
              'false',
            ].join(',')
          );

          if (result.details) {
            for (const detail of result.details) {
              rows.push(
                [
                  pluginId,
                  `"${result.name} - ${detail.label}"`,
                  detail.value,
                  detail.unit || result.unit,
                  new Date().toISOString(),
                  start.toISOString(),
                  end.toISOString(),
                  regions.join(','),
                  '',
                  '',
                  'true',
                ].join(',')
              );
            }
          }
        }
      csvData = rows.join('\n');
    }
  }

    const rowCount = csvData.split('\n').length - 1;
    const tableName = body.tableName || `jira_kpi_${Date.now()}`;

    // Push to Metabase
    const pushResult = await pushKpiToMetabase(config, csvData, tableName, {
      syncDatabaseId: body.syncDatabaseId,
      fullSync: body.fullSync,
      createCard: body.createCard,
      cardName: body.cardName,
    });

    return NextResponse.json({
      success: pushResult.success,
      mode: 'upload',
      tableName,
      rowCount,
      upload: pushResult.upload
        ? {
            success: pushResult.upload.success,
            tableId: pushResult.upload.tableId,
            tableName: pushResult.upload.tableName,
            rows: pushResult.upload.rows,
          }
        : undefined,
      sync: pushResult.sync
        ? {
            success: pushResult.sync.success,
            databaseId: pushResult.sync.databaseId,
            triggeredAt: pushResult.sync.triggeredAt,
            message: pushResult.sync.message,
          }
        : undefined,
      card: pushResult.card
        ? {
            success: pushResult.card.success,
            cardId: pushResult.card.cardId,
            url: pushResult.card.url,
            error: pushResult.card.error,
          }
        : undefined,
      error: pushResult.error,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
