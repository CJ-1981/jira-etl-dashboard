import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';

export async function POST(request: Request) {
  try {
    const { issues, holidays, dateFrom, dateTo, format = 'csv' } = await request.json();

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json({ error: 'Issues array is required' }, { status: 400 });
    }

    const engine = getKpiEngine();
    const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
    const end = dateTo ? new Date(dateTo) : new Date();

    // If dateTo was just a date string (YYYY-MM-DD), ensure it covers the full day
    if (dateTo && typeof dateTo === 'string' && dateTo.length <= 10) {
      end.setHours(23, 59, 59, 999);
    }

    const regions = holidays?.regions || [];

    const allResults = engine.calculateAll(issues, { regions }, { start, end });

    if (format === 'json') {
      return NextResponse.json(allResults);
    }

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

    const csv = rows.join('\n');
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="jira-kpi-export.csv"',
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Export failed' 
    }, { status: 500 });
  }
}
