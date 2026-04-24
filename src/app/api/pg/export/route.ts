import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getKpiEngine } from '@/lib/kpi/engine';
import { exportToPostgres } from '@/lib/postgres/client';
import type { JiraIssue } from '@/lib/jira/client';
import type { KpiDataRow } from '@/lib/postgres/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      connectionId,
      issues,
      holidays,
      dateFrom,
      dateTo,
      createSchema,
      truncate,
    } = body;

    if (!connectionId) {
      return NextResponse.json(
        { success: false, error: 'connectionId is required' },
        { status: 400 }
      );
    }

    // Get PG connection (need real password)
    const pgConn = await db.postgresConnection.findUnique({
      where: { id: connectionId },
    });

    if (!pgConn) {
      return NextResponse.json(
        { success: false, error: 'PostgreSQL connection not found' },
        { status: 404 }
      );
    }

    // Calculate KPIs if issues provided, otherwise use already-calculated data
    let kpiRows: KpiDataRow[];

    if (issues && issues.length > 0) {
      const engine = getKpiEngine();
      const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
      const end = dateTo ? new Date(dateTo) : new Date();
      const regions = holidays?.regions || [];

      const allResults = engine.calculateAll(
        issues as JiraIssue[],
        { regions },
        { start, end }
      );

      kpiRows = [];
      for (const [pluginId, results] of Object.entries(allResults)) {
        for (const result of results) {
          const dims = result.dimensions || {};
          kpiRows.push({
            kpi_id: pluginId,
            kpi_name: result.name,
            value: result.value,
            unit: result.unit,
            calculated_at: new Date().toISOString(),
            period_start: start.toISOString(),
            period_end: end.toISOString(),
            region: regions.join(','),
            priority: dims.priority || null,
            status: dims.status || null,
            is_detail: false,
          });

          if (result.details) {
            for (const detail of result.details) {
              kpiRows.push({
                kpi_id: pluginId,
                kpi_name: `${result.name} - ${detail.label}`,
                value: detail.value,
                unit: detail.unit || result.unit,
                calculated_at: new Date().toISOString(),
                period_start: start.toISOString(),
                period_end: end.toISOString(),
                region: regions.join(','),
                priority: dims.priority || null,
                status: dims.status || null,
                is_detail: true,
              });
            }
          }
        }
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'No issues data provided for calculation' },
        { status: 400 }
      );
    }

    // Export to PostgreSQL
    const pgResult = await exportToPostgres(
      {
        host: pgConn.host,
        port: pgConn.port,
        database: pgConn.database,
        username: pgConn.username,
        password: pgConn.password,
        sslMode: pgConn.sslMode,
      },
      {
        schemaName: pgConn.schemaName,
        tableName: pgConn.tableName,
      },
      kpiRows,
      {
        createSchema: createSchema || false,
        truncate: truncate || false,
      }
    );

    if (!pgResult.success) {
      return NextResponse.json(
        { success: false, error: pgResult.error },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      rowsExported: pgResult.rowsInserted,
      totalRows: pgResult.tableInfo?.totalRows || 0,
      table: `${pgConn.schemaName}.${pgConn.tableName}`,
      message: `Successfully exported ${pgResult.rowsInserted} KPI rows to PostgreSQL table "${pgConn.schemaName}"."${pgConn.tableName}"`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
