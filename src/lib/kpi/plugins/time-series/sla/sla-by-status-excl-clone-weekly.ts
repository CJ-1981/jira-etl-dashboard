/**
 * SLA Compliance by Status Trend (Excl. Clones) - Weekly
 *
 * SLA compliance rate for each workflow status per week, excluding clones
 * Tracks every status transition against its specific SLA target
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import { 
  getPeriodKey, 
  getPeriodEnd, 
  isPeriodComplete, 
  enumeratePeriodKeys 
} from '../../../utils/time-series-utils';

// ─── Calculation Function ───────────────────────────────────────────────────────

function calculateSlaByStatusTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  // Get SLA targets for each status from context
  const targets = (context.slaTargets || {}) as Record<string, number>;
  const targetEntries = (Object.entries(targets) as [string, number][]).filter(([, h]) => h > 0);
  
  if (targetEntries.length === 0 || context.issues.length === 0) {
    return [{
      name: 'SLA Compliance by Status Trend',
      value: 0,
      unit: '%',
      timeSeries: [],
    }];
  }

  const targetStatuses = new Set(targetEntries.map(([s]) => s));

  // Period -> Status -> { withinSla, total }
  const periodStatusData: Record<string, Record<string, { withinSla: number; total: number }>> = {};
  const allExitDates: Date[] = [];

  for (const issue of context.issues) {
    // Process each transition to check SLA for each status it passed through
    for (let i = 0; i < issue.transitions.length; i++) {
      const transition = issue.transitions[i];
      const status = transition.toStatus;

      // Only track statuses that have an SLA target
      if (!targetStatuses.has(status)) continue;

      const slaStart = transition.occurredAt;
      const nextTransition = issue.transitions[i + 1];
      
      // The status "ends" at the next transition or when the issue is resolved
      let statusExit = nextTransition ? nextTransition.occurredAt : issue.resolved;

      // If not resolved and no next transition, it's still in this status (aging)
      // For Trend charts, we usually only count COMPLETED status durations to avoid partial data bias
      if (!statusExit) continue;

      allExitDates.push(statusExit);

      const targetHours = targets[status];

      // Calculate business hours spent in this status
      const hours = calculateBusinessHours(slaStart, statusExit, {
        regions: context.holidays.regions,
        workStartHour: context.holidays.workStartHour,
        workEndHour: context.holidays.workEndHour,
        workDaysPerWeek: context.holidays.workDaysPerWeek,
      });

      const metSla = hours <= targetHours;
      const periodKey = getPeriodKey(statusExit, interval);

      if (!periodStatusData[periodKey]) {
        periodStatusData[periodKey] = {};
      }
      if (!periodStatusData[periodKey][status]) {
        periodStatusData[periodKey][status] = { withinSla: 0, total: 0 };
      }

      periodStatusData[periodKey][status].total++;
      if (metSla) {
        periodStatusData[periodKey][status].withinSla++;
      }
    }
  }

  // 2. Ensure all periods in range are represented
  if (allExitDates.length > 0) {
    const minDate = new Date(Math.min(...allExitDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allExitDates.map(d => d.getTime()), context.period.end.getTime()));
    const allPeriodKeys = enumeratePeriodKeys(minDate, maxDate, interval);

    for (const key of allPeriodKeys) {
      if (!periodStatusData[key]) {
        periodStatusData[key] = {};
      }
      for (const status of targetStatuses) {
        if (!periodStatusData[key][status]) {
          periodStatusData[key][status] = { withinSla: 0, total: 0 };
        }
      }
    }
  }

  // Build time-series data - multiple results (one per status)
  const statusResults: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  // For each status that has a target
  for (const [status, targetHours] of targetEntries) {
    const timeSeries: TimeSeriesResult['timeSeries'] = [];
    
    // Sort period keys to ensure chronological order
    const sortedPeriods = Object.keys(periodStatusData).sort();

    for (const periodKey of sortedPeriods) {
      const statusData = periodStatusData[periodKey][status];
      if (!statusData) continue;

      const periodEnd = getPeriodEnd(periodKey, interval);
      const isComplete = isPeriodComplete(periodEnd);

      if (!isComplete) {
        hasIncompletePeriod = true;
      }

      const complianceRate = statusData.total > 0 
        ? (statusData.withinSla / statusData.total) * 100 
        : 0;

      timeSeries.push({
        period: periodKey,
        date: periodEnd,
        value: Math.round(complianceRate * 100) / 100,
        count: statusData.total,
        isComplete,
      });
    }

    if (timeSeries.length === 0) continue;

    // Calculate overall compliance for this status from complete periods only
    const completePoints = timeSeries.filter(p => p.isComplete);
    const totalCountInComplete = completePoints.reduce((sum, point) => sum + point.count, 0);
    const overallCompliance = totalCountInComplete > 0
      ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) / totalCountInComplete
      : 0;

    statusResults.push({
      name: `SLA Compliance - ${status}`,
      value: Math.round(overallCompliance * 100) / 100,
      unit: '%',
      dimensions: { status },
      slaTargetHours: targetHours,
      timeSeries,
      details: [
        { label: 'Target', value: targetHours, unit: 'hours' },
        { label: 'Total Occurrences', value: timeSeries.reduce((sum, p) => sum + p.count, 0) }
      ]
    });
  }

  // Sort results by status name for consistent UI
  statusResults.sort((a, b) => a.name.localeCompare(b.name));

  if (hasIncompletePeriod && statusResults.length > 0) {
    statusResults[0].details?.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  return statusResults;
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const slaByStatusExclCloneWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'sla_by_status_excl_clone_trend',
  name: 'SLA Compliance by Status Trend (Excl. Clones)',
  description: 'SLA compliance rate for each workflow status, excluding tickets with "CLONE" in the title, grouped by week. Only counts completed status durations.',
  category: 'time-series',
  domain: 'sla',
  version: '1.0.0',
  unit: '%',
  timeInterval: 'weekly',
  calculate(context) {
    // Filter out tickets with "CLONE" in summary (case-sensitive as requested)
    const filteredContext = {
      ...context,
      issues: context.issues.filter(issue => !(issue.summary || '').includes('CLONE'))
    };
    return calculateSlaByStatusTrend(filteredContext, 'weekly');
  },
};

export default slaByStatusExclCloneWeeklyPlugin;
