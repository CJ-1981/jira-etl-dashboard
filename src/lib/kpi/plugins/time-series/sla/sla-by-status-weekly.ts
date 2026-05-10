/**
 * SLA Compliance by Status Trend - Weekly
 *
 * SLA compliance rate for each workflow status per week
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext, type TransformedIssue } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Group issues by time interval
 */
function groupByTimeInterval(
  issues: TransformedIssue[],
  interval: TimeInterval,
  dateExtractor: (issue: TransformedIssue) => Date
): Record<string, TransformedIssue[]> {
  const grouped: Record<string, TransformedIssue[]> = {};

  for (const issue of issues) {
    const date = dateExtractor(issue);
    const key = getPeriodKey(date, interval);

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(issue);
  }

  return grouped;
}

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
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'SLA Compliance by Status',
      value: 0,
      unit: '%',
      timeSeries: [],
    }];
  }

  // Get SLA targets for each status from context
  const slaTargets = context.slaTargets || {};
  const defaultSlaHours = context.holidays.slaTargetHours || 40;

  // Group issues by time interval (based on resolution date)
  const groupedByPeriod = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved!);

  // For each period, calculate SLA compliance for each status
  const periodStatusData: Record<string, Record<string, { withinSla: number; total: number }>> = {};

  for (const [periodKey, periodIssues] of Object.entries(groupedByPeriod)) {
    periodStatusData[periodKey] = {};

    for (const issue of periodIssues) {
      // Determine which status to measure SLA against
      // Use the final status before resolution
      const finalStatus = issue.transitions.length > 0
        ? issue.transitions[issue.transitions.length - 1].toStatus
        : issue.status;

      // Get SLA target for this status
      const slaTargetHours = slaTargets[finalStatus] || defaultSlaHours;

      // Calculate if this issue met SLA
      const hours = calculateBusinessHours(issue.created, issue.resolved!, {
        regions: context.holidays.regions,
        workStartHour: context.holidays.workStartHour,
        workEndHour: context.holidays.workEndHour,
        workDaysPerWeek: context.holidays.workDaysPerWeek,
      });
      const withinSla = hours <= slaTargetHours;

      if (!periodStatusData[periodKey][finalStatus]) {
        periodStatusData[periodKey][finalStatus] = { withinSla: 0, total: 0 };
      }

      periodStatusData[periodKey][finalStatus].total++;
      if (withinSla) {
        periodStatusData[periodKey][finalStatus].withinSla++;
      }
    }
  }

  // Build time-series data - multiple results (one per status) for multi-line chart
  const statusResults: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  // Get all unique statuses across all periods
  const allStatuses = new Set<string>();
  for (const periodData of Object.values(periodStatusData)) {
    Object.keys(periodData).forEach(status => allStatuses.add(status));
  }

  // For each status, create a time-series result
  for (const status of allStatuses) {
    const timeSeries: TimeSeriesResult['timeSeries'] = [];

    for (const [periodKey, periodData] of Object.entries(periodStatusData)) {
      const statusData = periodData[status];
      if (!statusData) continue; // This status didn't appear in this period

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

    // Sort by date
    timeSeries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
    });
  }

  const details: TimeSeriesResult['details'] = [
    { label: 'Statuses Analyzed', value: statusResults.length },
  ];

  if (hasIncompletePeriod) {
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  // Return multiple results (one per status) for multi-line chart
  return statusResults;
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const slaByStatusWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'sla_by_status_trend',
  name: 'SLA Compliance by Status Trend',
  description: 'SLA compliance rate for each workflow status, grouped by week',
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
