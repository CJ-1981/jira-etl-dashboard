/**
 * Throughput Trend - Weekly
 *
 * Number of tickets resolved per week
 */

import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import { 
  getPeriodEnd, 
  isPeriodComplete, 
  groupByTimeInterval, 
  enumeratePeriodKeys 
} from '../../../utils/time-series-utils';

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

  // 1. Group issues by time interval
  const grouped = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved);

  // 2. Ensure all periods in range are represented (even with zero throughput)
  // Compute date range from issues or context period
  const resolvedDates = resolvedIssues.map(i => new Date(i.resolved!).getTime());
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

    timeSeries.push({
      period: periodKey,
      date: periodEnd,
      value: issues.length,
      count: issues.length,
      isComplete,
    });
  }

  // Sort by date (chronological)
  timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

  const completePoints = timeSeries.filter(p => p.isComplete);
  const totalResolvedInComplete = completePoints.reduce((sum, p) => sum + p.value, 0);
  
  // Average throughput now includes zero-value periods because we enumerated them
  const avgThroughput = completePoints.length > 0 ? totalResolvedInComplete / completePoints.length : 0;

  const details: TimeSeriesResult['details'] = [
    { label: 'Complete Periods', value: completePoints.length },
    { label: 'Total Resolved', value: resolvedIssues.length },
    { label: 'Avg Throughput (Complete)', value: Math.round(avgThroughput * 100) / 100, unit: 'tickets/period' },
  ];

  if (completePoints.length > 0) {
    details.push({ label: 'Peak Period (Complete)', value: Math.round(Math.max(...completePoints.map(t => t.value))), unit: 'tickets' });
  }

  if (hasIncompletePeriod) {
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  return [{
    name: 'Throughput',
    value: Math.round(avgThroughput * 100) / 100,
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
