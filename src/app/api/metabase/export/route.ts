import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';
import type { JiraIssue } from '@/lib/jira/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issues, holidays, dateFrom, dateTo, format } = body;

    if (!issues) {
      return NextResponse.json({ success: false, error: 'issues required' }, { status: 400 });
    }

    const engine = getKpiEngine();
    const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
    const end = dateTo ? new Date(dateTo) : new Date();
    const regions = holidays?.regions || [];

    const allResults = engine.calculateAll(
      issues as JiraIssue[],
      { regions },
      { start, end }
    );

    if (format === 'csv') {
      const rows: string[] = ['KPI_ID,KPI_Name,Value,Unit,Priority,Assignee'];
      for (const [pluginId, results] of Object.entries(allResults)) {
        for (const result of results) {
          const dims = result.dimensions || {};
          rows.push(
            `${pluginId},"${result.name}",${result.value},${result.unit},${dims.priority || ''},${dims.assignee || ''}`
          );
        }
      }
      const csv = rows.join('\n');
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="jira-kpi-export.csv"',
        },
      });
    }

    // JSON format - Metabase-compatible flat table
    const metabaseRows: Record<string, unknown>[] = [];

    for (const [pluginId, results] of Object.entries(allResults)) {
      for (const result of results) {
        const dims = result.dimensions || {};
        metabaseRows.push({
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
        });

        if (result.details) {
          for (const detail of result.details) {
            metabaseRows.push({
              kpi_id: pluginId,
              kpi_name: `${result.name} - ${detail.label}`,
              value: detail.value,
              unit: detail.unit || result.unit,
              calculated_at: new Date().toISOString(),
              period_start: start.toISOString(),
              period_end: end.toISOString(),
              region: regions.join(','),
              is_detail: true,
            });
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      format: 'metabase',
      schema: {
        columns: [
          { name: 'kpi_id', type: 'text' },
          { name: 'kpi_name', type: 'text' },
          { name: 'value', type: 'numeric' },
          { name: 'unit', type: 'text' },
          { name: 'calculated_at', type: 'timestamp' },
          { name: 'period_start', type: 'timestamp' },
          { name: 'period_end', type: 'timestamp' },
          { name: 'region', type: 'text' },
          { name: 'priority', type: 'text' },
          { name: 'status', type: 'text' },
        ],
      },
      data: metabaseRows,
      metabaseConfig: {
        connectionType: 'JSON/CSV import',
        refreshInterval: 'Manual',
        suggestedQuestions: [
          'What is the average processing time?',
          'Show SLA compliance by priority',
          'What is the turnaround time per status?',
          'Show throughput trend over time',
        ],
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
