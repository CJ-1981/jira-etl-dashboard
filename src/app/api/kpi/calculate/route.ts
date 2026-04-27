import { NextResponse } from 'next/server';
import { KpiEngine } from '@/lib/kpi/engine';
import type { JiraIssue } from '@/lib/jira/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { issues, pluginIds, holidays, period, dateFrom, dateTo, slaTargets, activePluginIds, customPlugins, globalFilters } = body;

    if (!issues || !Array.isArray(issues)) {
      return NextResponse.json(
        { success: false, error: 'issues array is required' },
        { status: 400 }
      );
    }

    const engine = new KpiEngine();

    // Register custom plugins if provided
    if (customPlugins && Array.isArray(customPlugins)) {
      for (const pluginDef of customPlugins) {
        try {
          engine.registerCustomPlugin(pluginDef);
        } catch (err) {
          console.error(`Failed to register custom plugin ${pluginDef.id}:`, err);
        }
      }
    }

    const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
    const end = dateTo ? new Date(dateTo) : new Date();
    const regions = holidays?.regions || [];
    const workStart = holidays?.workStartHour || 9;
    const workEnd = holidays?.workEndHour || 17;
    const slaTargetHours = holidays?.slaTargetHours || 40;

    // Cast raw issues to JiraIssue format
    const typedIssues = issues as JiraIssue[];

    let results: Record<string, ReturnType<typeof engine.calculate>>;

    // Determine which plugins to calculate
    let pluginsToCalculate: string[] = [];
    if (activePluginIds && Array.isArray(activePluginIds)) {
      // Use selected active plugins (even if empty array = no plugins)
      pluginsToCalculate = activePluginIds;
    } else if (pluginIds && pluginIds.length > 0) {
      // Legacy support for pluginIds parameter
      pluginsToCalculate = pluginIds;
    } else {
      // Calculate all plugins (default behavior when nothing specified)
      pluginsToCalculate = engine.getAllPlugins().map(p => p.id);
    }

    // Calculate only the specified plugins
    results = {};
    for (const id of pluginsToCalculate) {
      try {
        results[id] = engine.calculate(id, typedIssues, { regions, workStartHour: workStart, workEndHour: workEnd, slaTargetHours }, { start, end }, slaTargets, globalFilters);
      } catch (err) {
        results[id] = [{
          name: `Error: ${id}`,
          value: 0,
          unit: '',
          details: [{ label: 'Error', value: 0 }],
        }];
      }
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
