/**
 * Priority Inflow Trend - Weekly
 *
 * Number of newly created tickets per week, split by priority (P0 → P3).
 * Complements throughput_trend (outflow) with the inflow side of the queue.
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
import { getPriorityOrder } from '../../../engine-utils';

// ─── Calculation Function ───────────────────────────────────────────────────────

function calculatePriorityInflowTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const allIssues = context.issues;
  if (allIssues.length === 0) {
    return [{
      name: 'New Tickets',
      value: 0,
      unit: 'tickets',
      timeSeries: [],
    }];
  }

  // All periods in the dashboard range, so quiet weeks still show as zero
  const rangeStart = context.period.start;
  const rangeEnd = context.period.end;

  // Priorities actually present in the data, ordered P0 → P3 (unknowns last)
  const priorities = Array.from(new Set(allIssues.map((i) => i.priority || 'None')))
    .sort((a, b) => getPriorityOrder(a) - getPriorityOrder(b));

  const results: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  for (const priority of priorities) {
    const priorityIssues = allIssues.filter((i) => (i.priority || 'None') === priority);

    const grouped = preparePeriods(priorityIssues, interval, (issue) => issue.created, rangeStart, rangeEnd);
    const { points: timeSeries, hasIncompletePeriod: incomplete } = buildTrendPoints(
      grouped,
      interval,
      (issues) => ({ value: issues.length, count: issues.length })
    );
    if (incomplete) hasIncompletePeriod = true;

    const completePoints = timeSeries.filter((p) => p.isComplete);
    const avgInflow = meanOfCompletePeriods(timeSeries);

    const details: TimeSeriesResult['details'] = [
      { label: 'Total Created', value: priorityIssues.length },
      { label: 'Complete Periods', value: completePoints.length },
    ];
    if (completePoints.length > 0) {
      details.push({ label: 'Peak Period (Complete)', value: Math.max(...completePoints.map((t) => t.value)), unit: 'tickets' });
    }

    results.push({
      name: `New Tickets: ${priority}`,
      value: round2(avgInflow),
      unit: 'tickets/period',
      dimensions: { priority },
      timeSeries,
      details,
    });
  }

  if (hasIncompletePeriod && results.length > 0) {
    results[0].details?.push({ ...INCOMPLETE_PERIOD_DETAIL });
  }

  return results;
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const priorityInflowWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'priority_inflow_trend',
  name: 'Priority Inflow Trend',
  description: 'Number of newly created tickets per week, split by priority (P0 → P3). Includes periods with zero inflow.',
  category: 'time-series',
  domain: 'throughput',
  version: '1.0.0',
  unit: 'tickets',
  timeInterval: 'weekly',
  calculate(context) {
    return calculatePriorityInflowTrend(context, 'weekly');
  },
};

export default priorityInflowWeeklyPlugin;
