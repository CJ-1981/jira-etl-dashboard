import { NextResponse } from 'next/server';
import { getKpiEngine } from '@/lib/kpi/engine';
import type { JiraIssue } from '@/lib/jira/client';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      issues, pluginIds, holidays, period,
      dateFrom, dateTo, slaTargets,
      activePluginIds, customPlugins, globalFilters,
      settings, region,
      connectionId, storageConfig,
    } = body;

    const engine = getKpiEngine();

    // Clear stale custom plugins from previous requests, then register fresh ones
    engine.clearCustomPlugins();

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

    // Load issues from DB if connectionId is provided (avoids serializing issues in POST body)
    let typedIssues: JiraIssue[];
    if (connectionId && storageConfig && !issues) {
      const db = getDb(storageConfig);
      const masterTickets = await (db as any).masterTicket.findMany({
        where: { connectionRef: connectionId },
        select: { rawData: true }
      });
      typedIssues = masterTickets.map((t: any) => {
        try { return JSON.parse(t.rawData); } catch { return null; }
      }).filter(Boolean) as JiraIssue[];
      console.log(`[KPI API] Loaded ${typedIssues.length} issues from DB for connection: ${connectionId}`);
    } else if (issues && Array.isArray(issues)) {
      typedIssues = issues as JiraIssue[];
    } else {
      return NextResponse.json(
        { success: false, error: 'Either issues array or connectionId + storageConfig is required' },
        { status: 400 }
      );
    }

    const start = dateFrom ? new Date(dateFrom) : new Date('2024-01-01');
    const end = dateTo ? new Date(dateTo) : new Date();
    
    // If dateTo was just a date string (YYYY-MM-DD), ensure it covers the full day
    if (dateTo && typeof dateTo === 'string' && dateTo.length <= 10) {
      end.setHours(23, 59, 59, 999);
    }

    // Debug logging to verify settings are received
    console.log('[KPI API] Settings received:', JSON.stringify(settings?.sla, null, 2));
    console.log('[KPI API] useAnyoneCommentsForSla:', settings?.sla?.useAnyoneCommentsForSla);
    
    // Resolve regions: prioritize direct passed regions, then region string, then settings
    const regions = (holidays?.regions && holidays.regions.length > 0) 
      ? holidays.regions 
      : (region ? [region] : (settings?.general?.defaultHolidayState ? [settings.general.defaultHolidayState] : []));
    
    const workStart = holidays?.workStartHour ?? settings?.general?.workStartHour ?? 9;
    const workEnd = holidays?.workEndHour ?? settings?.general?.workEndHour ?? 17;
    const slaTargetHours = holidays?.slaTargetHours ?? settings?.general?.defaultSlaTargetHours ?? 40;
    const effectiveSlaTargets = slaTargets ?? settings?.sla?.statusTargets ?? {};

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
