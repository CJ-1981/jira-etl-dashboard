/**
 * SLA Compliance by Status Trend - Weekly
 *
 * SLA compliance rate for each workflow status per week
 * Tracks every status transition against its specific SLA target
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext, type TransformedIssue } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Get period key for a date based on interval
 */
function getPeriodKey(date: Date, interval: TimeInterval): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const week = getWeekNumber(date);

  switch (interval) {
    case 'daily':
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    case 'weekly':
      return `${year}-W${week.toString().padStart(2, '0')}`;
    case 'monthly':
      return `${year}-${month.toString().padStart(2, '0')}`;
    default:
      return `${year}-${month}`;
  }
}

/**
 * Get the end date of a time period
 */
function getPeriodEnd(periodKey: string, interval: TimeInterval): Date {
  const parts = periodKey.split('-');
  const year = parseInt(parts[0], 10);

  switch (interval) {
    case 'daily': {
      const d = new Date(year, parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      d.setHours(23, 59, 59, 999);
      return d;
    }
    case 'weekly': {
      const week = parseInt(parts[1].replace('W', ''), 10);
      return getWeekEndDate(year, week);
    }
    case 'monthly': {
      const month = parseInt(parts[1], 10);
      const d = new Date(year, month, 0); // Last day of month
      d.setHours(23, 59, 59, 999);
      return d;
    }
    default: {
      return new Date();
    }
  }
}

/**
 * Get the end date of an ISO week
 */
function getWeekEndDate(year: number, week: number): Date {
  const jan1 = new Date(year, 0, 1);
  const days = (week - 1) * 7 + 4 - jan1.getDay();
  const endDate = new Date(year, 0, 1 + days);
  // Set to Sunday (end of ISO week)
  endDate.setDate(endDate.getDate() + (7 - endDate.getDay()) % 7);
  endDate.setHours(23, 59, 59, 999);
  return endDate;
}

/**
 * Check if a period is complete (not the current partial period)
 */
function isPeriodComplete(periodEnd: Date, currentDate: Date = new Date()): boolean {
  // Add 1 day buffer to ensure period is fully complete
  const bufferDays = 1;
  const completeThreshold = new Date(periodEnd);
  completeThreshold.setDate(completeThreshold.getDate() + bufferDays);

  return currentDate > completeThreshold;
}

/**
 * Get ISO week number
 */
function getWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

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

      const complianceRate = (statusData.withinSla / statusData.total) * 100;

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
    const overallCompliance = completePoints.length > 0
      ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) /
        completePoints.reduce((sum, point) => sum + point.count, 0)
      : 0;

    statusResults.push({
      name: `SLA Compliance - ${status}`,
      value: Math.round(overallCompliance * 100) / 100,
      unit: '%',
      dimensions: { status },
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

const slaByStatusWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'sla_by_status_trend',
  name: 'SLA Compliance by Status Trend',
  description: 'SLA compliance rate for each workflow status, grouped by week. Only counts completed status durations.',
  category: 'time-series',
  domain: 'sla',
  version: '1.0.0',
  unit: '%',
  timeInterval: 'weekly',
  calculate(context) {
    return calculateSlaByStatusTrend(context, 'weekly');
  },
};

export default slaByStatusWeeklyPlugin;
