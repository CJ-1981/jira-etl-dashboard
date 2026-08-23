/**
 * Processing Time Trend - Weekly
 *
 * Average business hours to resolve tickets, grouped by week
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import {
  preparePeriods,
  buildTrendPoints,
  weightedMeanOfCompletePeriods,
  round2,
  INCOMPLETE_PERIOD_DETAIL,
} from '../../../utils/trend-scaffold';

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

  // Group issues by interval and zero-fill all periods in range
  const resolvedDates = resolvedIssues.map(i => i.resolved!.getTime());
  const minDate = new Date(Math.min(...resolvedDates));
  const maxDate = new Date(Math.max(...resolvedDates, context.period.end.getTime()));
  const grouped = preparePeriods(resolvedIssues, interval, (issue) => issue.resolved, minDate, maxDate);

  const { points: timeSeries, hasIncompletePeriod } = buildTrendPoints(
    grouped,
    interval,
    (issues) => {
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
      return { value: round2(avgTime), count: issues.length };
    }
  );

  // Calculate overall average from complete periods only (weighted by count)
  const overallAvg = weightedMeanOfCompletePeriods(timeSeries, true);

  const details: TimeSeriesResult['details'] = [
    { label: 'Complete Periods', value: timeSeries.filter(p => p.isComplete).length },
    { label: 'Total Resolved', value: resolvedIssues.length },
  ];

  const completePoints = timeSeries.filter(p => p.isComplete && p.count > 0);
  if (completePoints.length > 0) {
    details.push(
      { label: 'Min Time (Complete)', value: round2(Math.min(...completePoints.map(t => t.value))), unit: 'hours' },
      { label: 'Max Time (Complete)', value: round2(Math.max(...completePoints.map(t => t.value))), unit: 'hours' }
    );
  }

  if (hasIncompletePeriod) {
    details.push({ ...INCOMPLETE_PERIOD_DETAIL });
  }

  return [{
    name: 'Avg. Processing Time',
    value: round2(overallAvg),
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
