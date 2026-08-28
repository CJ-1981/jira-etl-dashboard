/**
 * Client-side KPI calculation — browser port of the /api/kpi/calculate route
 * orchestration, used by the static GitHub Pages build (relay mode).
 *
 * @MX:NOTE: Mirrors the server route's parameter resolution exactly (period
 * defaulting, holiday/SLA settings, plugin selection) so relay-mode KPIs match
 * server-mode results for the same issue set. Issues come from the relay's
 * /dataset payload (full rawData incl. changelog) already held in memory.
 */

import { KpiEngine } from './engine';
import type { JiraIssue } from '@/lib/jira/client';
import type { KpiCalcResult } from '@/types/dashboard';
import type { AppSettings, KpiPlugin } from '@/lib/config/local-store';
import type { GermanState } from '@/lib/holidays/german-holidays';

/** Subset of the route body the calculator actually consumes. */
export interface ClientCalcParams {
  issues: JiraIssue[];
  dateFrom?: string;
  dateTo?: string;
  region?: string;
  globalFilters?: Record<string, unknown>;
  settings?: AppSettings | null;
  slaTargets?: Record<string, number>;
  activePluginIds?: string[];
  /** localStorage formula plugins; defaults to localConfig.getKpiPlugins(). */
  customPlugins?: KpiPlugin[];
}

export interface ClientCalcOutput {
  results: KpiCalcResult[];
  calculatedAt: string;
  holidays: {
    regions: string[];
    workStartHour: number;
    workEndHour: number;
    slaTargetHours: number;
  };
}

const DEFAULT_LOOKBACK_DAYS = 90;

export function calculateKpisClient(params: ClientCalcParams): ClientCalcOutput {
  const {
    issues, dateFrom, dateTo, region, globalFilters,
    settings, slaTargets, activePluginIds,
  } = params;

  // Fresh engine per call to avoid singleton mutation (same contract as the route)
  const engine = new KpiEngine();

  const customPlugins = params.customPlugins;
  if (customPlugins && Array.isArray(customPlugins)) {
    for (const pluginDef of customPlugins) {
      try {
        // localStorage plugin defs carry loosely-typed metadata (category as
        // string etc.) — the engine validates what it needs at registration.
        engine.registerCustomPlugin(pluginDef as Parameters<KpiEngine['registerCustomPlugin']>[0]);
      } catch (err) {
        console.error(`Failed to register custom plugin ${pluginDef.id}:`, err);
      }
    }
  }

  const end = dateTo ? new Date(dateTo) : new Date();
  const start = dateFrom
    ? new Date(dateFrom)
    : new Date(end.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // If dateTo was just a date string (YYYY-MM-DD), ensure it covers the full day
  if (dateTo && typeof dateTo === 'string' && dateTo.length <= 10) {
    end.setHours(23, 59, 59, 999);
  }

  // Resolve regions: direct region string, then settings default
  const regions: GermanState[] = region
    ? [region as GermanState]
    : settings?.general?.defaultHolidayState
      ? [settings.general.defaultHolidayState as GermanState]
      : [];

  const workStart = settings?.general?.workStartHour ?? 9;
  const workEnd = settings?.general?.workEndHour ?? 17;
  const slaTargetHours = settings?.general?.defaultSlaTargetHours ?? 40;
  const effectiveSlaTargets = slaTargets ?? settings?.sla?.statusTargets ?? {};

  // Determine which plugins to calculate (all when nothing specified)
  const pluginsToCalculate: string[] = activePluginIds ?? engine.getAllPlugins().map(p => p.id);

  const results = engine.calculateAll(
    issues,
    { regions, workStartHour: workStart, workEndHour: workEnd, slaTargetHours },
    { start, end },
    effectiveSlaTargets,
    globalFilters as Record<string, string[]> | undefined,
    settings?.sla?.useAnyoneCommentsForSla,
    pluginsToCalculate
  );

  const flat: KpiCalcResult[] = Object.entries(results).map(([pluginId, pluginResults]) => ({
    pluginId,
    // Route consumers normalize unit/value defensively; match that shape here.
    results: pluginResults.map((res) => ({
      ...res,
      unit: res.unit || '',
      value: typeof res.value === 'number' ? res.value : 0,
    })),
  }));

  return {
    results: flat,
    calculatedAt: new Date().toISOString(),
    holidays: {
      regions: regions as string[],
      workStartHour: workStart,
      workEndHour: workEnd,
      slaTargetHours,
    },
  };
}
