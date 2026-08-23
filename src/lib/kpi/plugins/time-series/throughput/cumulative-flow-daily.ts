/**
 * Cumulative Flow Diagram - Daily
 *
 * Number of tickets in each status over time (stacked area chart)
 */

import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import {
  enumerateTrendPeriods,
  buildSnapshotPoints,
} from '../../../utils/trend-scaffold';

// ─── Calculation Function ───────────────────────────────────────────────────────

function calculateCumulativeFlow(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  // @MX:ANCHOR: calculateCumulativeFlow
  const { start, end } = context.period;
  const allIssues = context.issues;

  // 1. Generate periods (point-in-time snapshots)
  const periods = enumerateTrendPeriods(start, end, interval);
  if (periods.length === 0) return [];

  // 2. Identify all statuses
  const allStatusesSet = new Set<string>();
  allIssues.forEach(i => {
    allStatusesSet.add(i.status);
    i.transitions.forEach(t => {
      if (t.fromStatus) allStatusesSet.add(t.fromStatus);
      if (t.toStatus) allStatusesSet.add(t.toStatus);
    });
  });
  const allStatuses = Array.from(allStatusesSet);

  // 3. Precompute status intervals for each issue (O(Issues * Transitions))
  const issueTimelines = allIssues.map(issue => {
    const intervals: { status: string; start: number; end: number }[] = [];
    const createdTime = issue.created.getTime();

    if (issue.transitions.length === 0) {
      intervals.push({ status: issue.status, start: createdTime, end: Infinity });
    } else {
      const sorted = [...issue.transitions].sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

      // Initial status interval
      intervals.push({
        status: sorted[0].fromStatus ?? 'Created',
        start: createdTime,
        end: sorted[0].occurredAt.getTime()
      });

      // Status intervals from transitions
      for (let i = 0; i < sorted.length; i++) {
        intervals.push({
          status: sorted[i].toStatus,
          start: sorted[i].occurredAt.getTime(),
          end: sorted[i + 1] ? sorted[i + 1].occurredAt.getTime() : Infinity
        });
      }
    }
    return intervals;
  });

  // 4. Aggregate counts per status per period (O(Issues * Transitions + Periods * Statuses))
  // Initialize result structure
  const periodCounts: Record<string, Record<string, number>> = {};
  periods.forEach(p => {
    periodCounts[p.key] = {};
    allStatuses.forEach(s => { periodCounts[p.key][s] = 0; });
  });

  // Calculate counts using precomputed intervals
  issueTimelines.forEach(timeline => {
    timeline.forEach(intervalEntry => {
      // Find range of periods that fall into this interval
      for (const period of periods) {
        const time = period.end.getTime();
        if (time >= intervalEntry.start && time < intervalEntry.end) {
          const s = intervalEntry.status;
          periodCounts[period.key][s] = (periodCounts[period.key][s] || 0) + 1;
        }
      }
    });
  });

  // 5. Convert to TimeSeriesResult format
  return allStatuses.map(status => {
    const { points: timeSeries } = buildSnapshotPoints(periods, (period) => {
      const count = periodCounts[period.key][status] || 0;
      return { value: count, count };
    });

    const lastCompletePoint = [...timeSeries].reverse().find(p => p.isComplete);
    const currentValue = lastCompletePoint ? lastCompletePoint.value : (timeSeries.length > 0 ? timeSeries[timeSeries.length - 1].value : 0);

    return {
      name: status,
      value: currentValue,
      unit: 'tickets',
      dimensions: { status },
      timeSeries,
    };
  });
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const cumulativeFlowDailyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'cumulative_flow_trend',
  name: 'Cumulative Flow Diagram',
  description: 'Cumulative Flow Diagram (CFD): number of tickets in each status over time (stacked area chart). Includes periods with zero tickets.',
  category: 'time-series',
  domain: 'throughput',
  version: '1.0.0',
  unit: 'tickets',
  timeInterval: 'daily',
  calculate(context) {
    return calculateCumulativeFlow(context, 'daily');
  },
};

export default cumulativeFlowDailyPlugin;
