/**
 * Priority Inflow Trend - Weekly
 *
 * Number of newly created tickets per week, split by priority (P0 → P3).
 * Complements throughput_trend (outflow) with the inflow side of the queue.
 */

import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import {
  getPeriodEnd,
  isPeriodComplete,
  groupByTimeInterval,
  enumeratePeriodKeys,
} from '../../../utils/time-series-utils';
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
  const allPeriodKeys = enumeratePeriodKeys(context.period.start, context.period.end, interval);

  // Priorities actually present in the data, ordered P0 → P3 (unknowns last)
  const priorities = Array.from(new Set(allIssues.map((i) => i.priority || 'None')))
    .sort((a, b) => getPriorityOrder(a) - getPriorityOrder(b));

  const results: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  for (const priority of priorities) {
    const priorityIssues = allIssues.filter((i) => (i.priority || 'None') === priority);

    const grouped = groupByTimeInterval(priorityIssues, interval, (issue) => issue.created);
    for (const key of allPeriodKeys) {
      if (!grouped[key]) grouped[key] = [];
    }

    const timeSeries: TimeSeriesResult['timeSeries'] = [];
    for (const [periodKey, issues] of Object.entries(grouped)) {
      const periodEnd = getPeriodEnd(periodKey, interval);
      const isComplete = isPeriodComplete(periodEnd);
      if (!isComplete) hasIncompletePeriod = true;

      timeSeries.push({
        period: periodKey,
        date: periodEnd,
        value: issues.length,
        count: issues.length,
        isComplete,
      });
    }
    timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

    const completePoints = timeSeries.filter((p) => p.isComplete);
    const totalInComplete = completePoints.reduce((sum, p) => sum + p.value, 0);
    const avgInflow = completePoints.length > 0 ? totalInComplete / completePoints.length : 0;

    const details: TimeSeriesResult['details'] = [
      { label: 'Total Created', value: priorityIssues.length },
      { label: 'Complete Periods', value: completePoints.length },
    ];
    if (completePoints.length > 0) {
      details.push({ label: 'Peak Period (Complete)', value: Math.max(...completePoints.map((t) => t.value)), unit: 'tickets' });
    }

    results.push({
      name: `New Tickets: ${priority}`,
      value: Math.round(avgInflow * 100) / 100,
      unit: 'tickets/period',
      dimensions: { priority },
      timeSeries,
      details,
    });
  }

  if (hasIncompletePeriod && results.length > 0) {
    results[0].details?.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
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
