/**
 * SLA Compliance Trend - Weekly
 *
 * SLA compliance rate per week
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

function calculateSlaTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const slaTargetHours = context.holidays.slaTargetHours || 40;
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'SLA Compliance',
      value: 0,
      unit: '%',
      timeSeries: [],
    }];
  }

  // Group issues by time interval
  const grouped = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved!);

  // Calculate SLA compliance per period, filtering incomplete periods
  const timeSeries: TimeSeriesResult['timeSeries'] = [];
  let hasIncompletePeriod = false;

  for (const [periodKey, issues] of Object.entries(grouped)) {
    const periodEnd = getPeriodEnd(periodKey, interval);
    const isComplete = isPeriodComplete(periodEnd);

    if (!isComplete) {
      hasIncompletePeriod = true;
    }

    const withinSla = issues.filter((issue) => {
      const hours = calculateBusinessHours(issue.created, issue.resolved!, {
        regions: context.holidays.regions,
        workStartHour: context.holidays.workStartHour,
        workEndHour: context.holidays.workEndHour,
        workDaysPerWeek: context.holidays.workDaysPerWeek,
      });
      return hours <= slaTargetHours;
    }).length;

    const complianceRate = (withinSla / issues.length) * 100;

    timeSeries.push({
      period: periodKey,
      date: periodEnd,
      value: Math.round(complianceRate * 100) / 100,
      count: issues.length,
      isComplete,
    });
  }

  // Sort by date
  timeSeries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate overall compliance from complete periods only
  const completePoints = timeSeries.filter(p => p.isComplete);
  const overallCompliance = completePoints.length > 0
    ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) /
      completePoints.reduce((sum, point) => sum + point.count, 0)
    : 0;

  const details: TimeSeriesResult['details'] = [
    { label: 'Complete Periods', value: completePoints.length },
    { label: 'Total Resolved', value: resolvedIssues.length },
    { label: 'SLA Target', value: slaTargetHours, unit: 'hours' },
  ];

  if (completePoints.length > 0) {
    const minCompliance = Math.min(...completePoints.map(t => t.value));
    const maxCompliance = Math.max(...completePoints.map(t => t.value));
    details.push(
      { label: 'Worst Period (Complete)', value: Math.round(minCompliance), unit: '%' },
      { label: 'Best Period (Complete)', value: Math.round(maxCompliance), unit: '%' }
    );
  }

  if (hasIncompletePeriod) {
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  return [{
    name: 'SLA Compliance',
    value: Math.round(overallCompliance * 100) / 100,
    unit: '%',
    timeSeries,
    details,
  }];
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const slaComplianceWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'sla_trend',
  name: 'SLA Trend',
  description: 'SLA compliance rate per week',
  category: 'time-series',
  domain: 'sla',
  version: '1.0.0',
  unit: '%',
  timeInterval: 'weekly',
  calculate(context) {
    return calculateSlaTrend(context, 'weekly');
  },
};

export default slaComplianceWeeklyPlugin;
