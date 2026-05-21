/**
 * KPI Calculation Web Worker
 *
 * Offloads heavy KPI calculations to a background thread to keep the UI responsive.
 */

import { KpiEngine } from './engine';

// @MX:NOTE: Module-level engine cache to prevent re-initialization on every message
// @MX:REASON: KpiEngine constructor loads and registers all plugins - expensive operation
let cachedEngine: KpiEngine | null = null;

function getEngine(): KpiEngine {
  if (!cachedEngine) {
    cachedEngine = new KpiEngine();
  }
  return cachedEngine;
}

// Use a simplified version of the API route logic
self.onmessage = (e) => {
  const { pluginId, issues, holidays, period, slaTargets, globalFilters, calculateAll, useAnyoneCommentsForSla } = e.data;

  try {
    // @MX:NOTE: Use cached engine instance instead of creating new one each time
    const engine = getEngine();
    
    // Transform string dates back to Date objects if they were serialized
    const parsedHolidays = {
      ...holidays,
      regions: holidays.regions || [],
    };

    const parsedPeriod = {
      start: new Date(period.start),
      end: new Date(period.end),
    };

    let result;
    if (calculateAll) {
      result = engine.calculateAll(issues, parsedHolidays, parsedPeriod, slaTargets, globalFilters, useAnyoneCommentsForSla);
    } else if (pluginId) {
      result = engine.calculate(pluginId, issues, parsedHolidays, parsedPeriod, slaTargets, globalFilters, useAnyoneCommentsForSla);
    }

    self.postMessage({ success: true, result });
  } catch (error) {
    self.postMessage({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown calculation error' 
    });
  }
};
