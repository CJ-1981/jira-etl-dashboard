/**
 * Turnaround Time by Status Trend - Daily
 *
 * Average business hours tickets spend in each workflow status, grouped by day
 * 
 * @MX:NOTE: Tracks turnaround time trends by status.
 * @MX:WARN: Only counts completed status durations to avoid partial data bias.
 * @MX:ANCHOR: Turnaround Trend - visualize bottleneck evolution.
 * @MX:TODO: Add monthly interval support.
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import { 
  getPeriodKey, 
  getPeriodEnd, 
  isPeriodComplete, 
  groupByTimeInterval, 
  enumeratePeriodKeys 
} from '../../../utils/time-series-utils';

// ─── Calculation Function ───────────────────────────────────────────────────────

function calculateTimeInStatusTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'Turnaround Time by Status',
      value: 0,
      unit: 'hours',
      timeSeries: [],
    }];
  }

  // 1. Group issues by time interval (based on resolution date)
  const groupedByPeriod = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved);

  // 2. Ensure all periods in range are represented
  const resolvedDates = resolvedIssues.map(i => i.resolved!.getTime());
  const minDate = new Date(Math.min(...resolvedDates));
  const maxDate = new Date(Math.max(...resolvedDates, context.period.end.getTime()));
  
  const allPeriodKeys = enumeratePeriodKeys(minDate, maxDate, interval);
  for (const key of allPeriodKeys) {
    if (!groupedByPeriod[key]) {
      groupedByPeriod[key] = [];
    }
  }

  // 3. For each period, calculate time in each status
  const periodStatusData: Record<string, Record<string, { totalHours: number; count: number }>> = {};

  for (const [periodKey, periodIssues] of Object.entries(groupedByPeriod)) {
    periodStatusData[periodKey] = {};

    for (const issue of periodIssues) {
      for (let i = 0; i < issue.transitions.length; i++) {
        const transition = issue.transitions[i];
        const status = transition.toStatus;
        const nextTransition = issue.transitions[i + 1];
        const nextTime = nextTransition ? nextTransition.occurredAt : issue.resolved!;

        const hours = calculateBusinessHours(transition.occurredAt, nextTime, {
          regions: context.holidays.regions,
          workStartHour: context.holidays.workStartHour,
          workEndHour: context.holidays.workEndHour,
          workDaysPerWeek: context.holidays.workDaysPerWeek,
        });

        if (!periodStatusData[periodKey][status]) {
          periodStatusData[periodKey][status] = { totalHours: 0, count: 0 };
        }

        periodStatusData[periodKey][status].totalHours += hours;
        periodStatusData[periodKey][status].count++;
      }
    }
  }

  // Build time-series data - multiple results (one per status) for multi-line chart
  const statusResults: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  // Get all unique statuses across all periods
  const allStatusesSet = new Set<string>();
  for (const periodData of Object.values(periodStatusData)) {
    Object.keys(periodData).forEach(status => allStatusesSet.add(status));
  }
  const allStatuses = Array.from(allStatusesSet);

  // For each status, create a time-series result
  for (const status of allStatuses) {
    const timeSeries: TimeSeriesResult['timeSeries'] = [];
    const sortedPeriodKeys = Object.keys(periodStatusData).sort();

    for (const periodKey of sortedPeriodKeys) {
      const periodData = periodStatusData[periodKey];
      const statusData = periodData[status] || { totalHours: 0, count: 0 };

      const periodEnd = getPeriodEnd(periodKey, interval);
      const isComplete = isPeriodComplete(periodEnd);

      if (!isComplete) {
        hasIncompletePeriod = true;
      }

      const avgHours = statusData.count > 0 ? statusData.totalHours / statusData.count : 0;

      timeSeries.push({
        period: periodKey,
        date: periodEnd,
        value: Math.round(avgHours * 100) / 100,
        count: statusData.count,
        isComplete,
      });
    }

    // Sort by date (already sorted by keys, but safe)
    timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate overall average for this status from complete periods only
    const completePoints = timeSeries.filter(p => p.isComplete && p.count > 0);
    const weightedSum = completePoints.reduce((sum, point) => sum + point.value * point.count, 0);
    const totalCount = completePoints.reduce((sum, point) => sum + point.count, 0);
    const overallAvg = totalCount > 0 ? weightedSum / totalCount : 0;

    statusResults.push({
      name: `Time in ${status}`,
      value: Math.round(overallAvg * 100) / 100,
      unit: 'hours',
      dimensions: { status },
      timeSeries,
    });
  }

  const details: TimeSeriesResult['details'] = [
    { label: 'Statuses Analyzed', value: statusResults.length },
    { label: 'Total Resolved', value: resolvedIssues.length },
  ];

  if (hasIncompletePeriod && statusResults.length > 0) {
    statusResults[0].details = statusResults[0].details || [];
    statusResults[0].details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  // Return multiple results (one per status) for multi-line chart
  return statusResults;
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const timeInStatusDailyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'time_in_status_trend_daily',
  name: 'Time In Status Trend (Daily)',
  description: 'Average business hours tickets spend in each workflow status, grouped by day',
  category: 'time-series',
  domain: 'turnaround',
  version: '1.0.0',
  unit: 'hours',
  timeInterval: 'daily',
  calculate(context) {
    return calculateTimeInStatusTrend(context, 'daily');
  },
};

export default timeInStatusDailyPlugin;
