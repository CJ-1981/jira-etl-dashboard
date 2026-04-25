import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';
import type { JiraIssue } from '@/lib/jira/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issues, pluginIds, holidays, period, dateFrom, dateTo, slaTargets } = body;

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json(
        { success: false, error: 'issues array is required' },
        { status: 400 }
      );
    }

    const engine = getKpiEngine();

    const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
    const end = dateTo ? new Date(dateTo) : new Date();
    const regions = holidays?.regions || [];
    const workStart = holidays?.workStartHour || 9;
    const workEnd = holidays?.workEndHour || 17;
    const slaTargetHours = holidays?.slaTargetHours || 40;

    // Cast raw issues to JiraIssue format
    const typedIssues = issues as JiraIssue[];

    let results: Record<string, ReturnType<typeof engine.calculate>>;

    if (pluginIds && pluginIds.length > 0) {
      results = {};
      for (const id of pluginIds) {
        try {
          results[id] = engine.calculate(id, typedIssues, { regions, workStartHour: workStart, workEndHour: workEnd, slaTargetHours }, { start, end }, slaTargets);
        } catch (err) {
          results[id] = [{
            name: `Error: ${id}`,
            value: 0,
            unit: '',
            details: [{ label: 'Error', value: 0 }],
          }];
        }
      }
    } else {
      results = engine.calculateAll(typedIssues, { regions, workStartHour: workStart, workEndHour: workEnd, slaTargetHours }, { start, end }, slaTargets);
    }

    // Flatten results for easier consumption
    const flat = Object.entries(results).map(([pluginId, pluginResults]) => ({
      pluginId,
      results: pluginResults,
    }));

    return NextResponse.json({
      success: true,
      calculatedAt: new Date().toISOString(),
      holidays: {
        regions,
        workStartHour: workStart,
        workEndHour: workEnd,
        slaTargetHours,
      },
      results: flat,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
