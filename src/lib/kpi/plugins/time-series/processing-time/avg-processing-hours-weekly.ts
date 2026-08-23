/**
 * Processing Time Trend - Weekly
 *
 * Average business hours to resolve tickets, grouped by week
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

function calculateProcessingTimeTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'Avg. Processing Time',
      value: 0,
      unit: 'hours',
      timeSeries: [],
    }];
  }

  // 1. Group issues by time interval
  const grouped = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved);

  // 2. Ensure all periods in range are represented (even with zero resolved)
  const resolvedDates = resolvedIssues.map(i => i.resolved!.getTime());
  const minDate = new Date(Math.min(...resolvedDates));
  const maxDate = new Date(Math.max(...resolvedDates, context.period.end.getTime()));
  
  const allPeriodKeys = enumeratePeriodKeys(minDate, maxDate, interval);
  for (const key of allPeriodKeys) {
    if (!grouped[key]) {
      grouped[key] = [];
    }
  }

  // 3. Build time-series data
  const timeSeries: TimeSeriesResult['timeSeries'] = [];
  let hasIncompletePeriod = false;

  for (const [periodKey, issues] of Object.entries(grouped)) {
    const periodEnd = getPeriodEnd(periodKey, interval);
    const isComplete = isPeriodComplete(periodEnd);

    if (!isComplete) {
      hasIncompletePeriod = true;
    }

    let avgTime = 0;
    if (issues.length > 0) {
      const processingTimes = issues.map((issue) =>
        calculateBusinessHours(issue.created, issue.resolved!, {
          regions: context.holidays.regions,
          workStartHour: context.holidays.workStartHour,
          workEndHour: context.holidays.workEndHour,
          workDaysPerWeek: context.holidays.workDaysPerWeek,
        })
      );
      avgTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
    }

    timeSeries.push({
      period: periodKey,
      date: periodEnd,
      value: Math.round(avgTime * 100) / 100,
      count: issues.length,
      isComplete: isComplete,
    });
  }

  // Sort by date
  // @MX:WARN: `new Date(...)` normalizes `Date | string` (ISO string after JSON API round-trip)
  timeSeries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Calculate overall average from complete periods only
  const completePoints = timeSeries.filter(p => p.isComplete && p.count > 0);
  const totalCountInComplete = completePoints.reduce((sum, point) => sum + point.count, 0);
  const overallAvg = totalCountInComplete > 0
    ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) / totalCountInComplete
    : 0;

  const details: TimeSeriesResult['details'] = [
    { label: 'Complete Periods', value: timeSeries.filter(p => p.isComplete).length },
    { label: 'Total Resolved', value: resolvedIssues.length },
  ];

  if (completePoints.length > 0) {
    details.push(
      { label: 'Min Time (Complete)', value: Math.round(Math.min(...completePoints.map(t => t.value)) * 100) / 100, unit: 'hours' },
      { label: 'Max Time (Complete)', value: Math.round(Math.max(...completePoints.map(t => t.value)) * 100) / 100, unit: 'hours' }
    );
  }

  if (hasIncompletePeriod) {
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  return [{
    name: 'Avg. Processing Time',
    value: Math.round(overallAvg * 100) / 100,
    unit: 'hours',
    timeSeries,
    details,
  }];
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const avgProcessingHoursWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'processing_time_trend',
  name: 'Processing Time Trend',
  description: 'Average business hours to resolve tickets, grouped by week. Includes periods with zero resolved tickets.',
  category: 'time-series',
  domain: 'processing-time',
  version: '1.0.0',
  unit: 'hours',
  timeInterval: 'weekly',
  calculate(context) {
    return calculateProcessingTimeTrend(context, 'weekly');
  },
};

export default avgProcessingHoursWeeklyPlugin;
