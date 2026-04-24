import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getKpiEngine } from '@/lib/kpi/engine';
import type { JiraIssue } from '@/lib/jira/client';
import {
  pushKpiToMetabase,
  triggerMetabaseSync,
  createMetabaseCard,
  type MetabaseConnectionConfig,
} from '@/lib/metabase/client';

/**
 * POST /api/metabase/push
 *
 * Pushes KPI data directly to Metabase.
 * Supports two modes:
 * 1. "upload" — Upload CSV directly to Metabase (table/upload endpoint)
 * 2. "sync"   — Trigger a sync on a Metabase database (e.g., after PG export)
 *
 * Body:
 * {
 *   mode: "upload" | "sync",
 *   connectionId: string,         // Metabase connection ID
 *   issues: JiraIssue[],          // (upload mode) Issues to calculate KPIs from
 *   holidays?: { regions: string[] },
 *   dateFrom?: string,
 *   dateTo?: string,
 *   tableName?: string,           // (upload mode) Target table name
 *   syncDatabaseId?: number,      // (optional) Database to sync after upload
 *   fullSync?: boolean,           // (optional) Full sync
 *   createCard?: boolean,         // (optional) Auto-create a Metabase question
 *   cardName?: string,            // (optional) Name for auto-created card
 *   // Or for sync-only mode:
 *   databaseId: number,           // Database ID to sync
 * }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { mode = 'upload', connectionId } = body;

    if (!connectionId) {
      return NextResponse.json(
        { success: false, error: 'connectionId is required' },
        { status: 400 }
      );
    }

    // Load Metabase connection from DB
    const conn = await db.metabaseConnection.findUnique({ where: { id: connectionId } });
    if (!conn) {
      return NextResponse.json(
        { success: false, error: 'Metabase connection not found' },
        { status: 404 }
      );
    }

    const config: MetabaseConnectionConfig = {
      baseUrl: conn.baseUrl,
      username: conn.username,
      password: conn.password,
      apiKey: conn.apiKey,
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
    const { issues, holidays, dateFrom, dateTo } = body;

    if (!issues || !Array.isArray(issues) || issues.length === 0) {
      return NextResponse.json(
        { success: false, error: 'issues array is required for upload mode' },
        { status: 400 }
      );
    }

    // Calculate KPIs
    const engine = getKpiEngine();
    const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
    const end = dateTo ? new Date(dateTo) : new Date();
    const regions = holidays?.regions || [];

    const allResults = engine.calculateAll(issues as JiraIssue[], { regions }, { start, end });

    // Build CSV
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
    }

    const csvData = rows.join('\n');
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
      rowCount: rows.length - 1, // minus header
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
