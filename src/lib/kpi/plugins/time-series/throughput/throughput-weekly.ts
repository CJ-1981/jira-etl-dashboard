/**
 * Throughput Trend - Weekly
 *
 * Number of tickets resolved per week
 */

import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import {
  preparePeriods,
  buildTrendPoints,
  meanOfCompletePeriods,
  round2,
  INCOMPLETE_PERIOD_DETAIL,
} from '../../../utils/trend-scaffold';

// ─── Calculation Function ───────────────────────────────────────────────────────

function calculateThroughputTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'Throughput',
      value: 0,
      unit: 'tickets',
      timeSeries: [],
    }];
  }

  // Group issues by interval and zero-fill all periods in range
  const resolvedDates = resolvedIssues.map(i => new Date(i.resolved!).getTime());
  const minDate = new Date(Math.min(...resolvedDates));
  const maxDate = new Date(Math.max(...resolvedDates, context.period.end.getTime()));
  const grouped = preparePeriods(resolvedIssues, interval, (issue) => issue.resolved, minDate, maxDate);

  const { points: timeSeries, hasIncompletePeriod } = buildTrendPoints(
    grouped,
    interval,
    (issues) => ({ value: issues.length, count: issues.length })
  );

  const completePoints = timeSeries.filter(p => p.isComplete);
  // Average throughput includes zero-value periods because we enumerated them
  const avgThroughput = meanOfCompletePeriods(timeSeries);

  const details: TimeSeriesResult['details'] = [
    { label: 'Complete Periods', value: completePoints.length },
    { label: 'Total Resolved', value: resolvedIssues.length },
    { label: 'Avg Throughput (Complete)', value: round2(avgThroughput), unit: 'tickets/period' },
  ];

  if (completePoints.length > 0) {
    details.push({ label: 'Peak Period (Complete)', value: Math.round(Math.max(...completePoints.map(t => t.value))), unit: 'tickets' });
  }

  if (hasIncompletePeriod) {
    details.push({ ...INCOMPLETE_PERIOD_DETAIL });
  }

  return [{
    name: 'Throughput',
    value: round2(avgThroughput),
    unit: 'tickets/period',
    timeSeries,
    details,
  }];
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const throughputWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'throughput_trend',
  name: 'Throughput Trend',
  description: 'Number of tickets resolved per week. Includes periods with zero throughput.',
  category: 'time-series',
  domain: 'throughput',
  version: '1.0.0',
  unit: 'tickets',
  timeInterval: 'weekly',
  calculate(context) {
    return calculateThroughputTrend(context, 'weekly');
  },
};

export default throughputWeeklyPlugin;
