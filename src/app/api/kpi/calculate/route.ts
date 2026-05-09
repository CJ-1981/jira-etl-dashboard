import { NextResponse } from 'next/server';
import { KpiEngine } from '@/lib/kpi/engine';
import type { JiraIssue } from '@/lib/jira/client';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      issues, pluginIds, holidays, period,
      dateFrom, dateTo, slaTargets,
      activePluginIds, customPlugins, globalFilters,
      settings, region
    } = body;

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
    
    // Resolve regions: prioritize direct passed regions, then region string, then settings
    const regions = (holidays?.regions && holidays.regions.length > 0) 
      ? holidays.regions 
      : (region ? [region] : (settings?.general?.defaultHolidayState ? [settings.general.defaultHolidayState] : []));
    
    const workStart = holidays?.workStartHour ?? settings?.general?.workStartHour ?? 9;
    const workEnd = holidays?.workEndHour ?? settings?.general?.workEndHour ?? 17;
    const slaTargetHours = holidays?.slaTargetHours ?? settings?.general?.defaultSlaTargetHours ?? 40;
    const effectiveSlaTargets = slaTargets ?? settings?.sla?.statusTargets ?? {};

    // Cast raw issues to JiraIssue format
    const typedIssues = issues as JiraIssue[];
    console.log(`[KPI API] Starting calculation for ${typedIssues.length} issues.`);
    if (globalFilters) {
      console.log(`[KPI API] Applying global filters: ${JSON.stringify(globalFilters)}`);
    }

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
        results[id] = engine.calculate(id, typedIssues, { regions, workStartHour: workStart, workEndHour: workEnd, slaTargetHours }, { start, end }, effectiveSlaTargets, globalFilters, settings?.sla?.useAnyoneCommentsForSla);
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
