import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';

// @MX:NOTE: CSV injection guard — spreadsheet apps (Excel/Calc) execute cells that start
// with = + - @ as formulas. Jira-derived values (KPI names, dimensions, ticket fields) are
// untrusted, so prefix a single quote to force literal-text interpretation. Numbers are
// passed through untouched.
function sanitizeCsvCell(value: unknown): string {
  if (typeof value === 'number') return String(value);
  const str = value == null ? '' : String(value);
  return /^[=+\-@]/.test(str) ? `'${str}` : str;
}

export async function POST(request: Request) {
  try {
    const { issues, holidays, dateFrom, dateTo, format = 'csv' } = await request.json();

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json({ error: 'Issues array is required' }, { status: 400 });
    }

    const engine = getKpiEngine();
    const end = dateTo ? new Date(dateTo) : new Date();

    // Default dateFrom to a rolling 90-day window ending at `end` instead of a
    // hardcoded calendar date (previously 2024-01-01), which silently grew stale.
    const DEFAULT_LOOKBACK_DAYS = 90;
    const start = dateFrom
      ? new Date(dateFrom)
      : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

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
            sanitizeCsvCell(pluginId),
            `"${sanitizeCsvCell(result.name)}"`,
            result.value,
            sanitizeCsvCell(result.unit),
            sanitizeCsvCell(new Date().toISOString()),
            sanitizeCsvCell(start.toISOString()),
            sanitizeCsvCell(end.toISOString()),
            sanitizeCsvCell(regions.join(',')),
            sanitizeCsvCell(dims.priority || ''),
            sanitizeCsvCell(dims.status || ''),
            'false',
          ].join(',')
        );

        if (result.details) {
          for (const detail of result.details) {
            rows.push(
              [
                sanitizeCsvCell(pluginId),
                `"${sanitizeCsvCell(result.name)} - ${sanitizeCsvCell(detail.label)}"`,
                detail.value,
                sanitizeCsvCell(detail.unit || result.unit),
                sanitizeCsvCell(new Date().toISOString()),
                sanitizeCsvCell(start.toISOString()),
                sanitizeCsvCell(end.toISOString()),
                sanitizeCsvCell(regions.join(',')),
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
