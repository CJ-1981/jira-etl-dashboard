/**
 * Cumulative Flow Diagram - Daily
 *
 * Number of tickets in each status over time (stacked area chart)
 */

import { isIssueDone } from '../../../engine-utils';
import { type KpiPlugin, type KpiContext, type TransformedIssue } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';

// ─── Utility Functions ─────────────────────────────────────────────────────────

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

function calculateCumulativeFlow(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  // @MX:ANCHOR: calculateCumulativeFlow
  const { start, end } = context.period;
  const allIssues = context.issues;

  // 1. Generate periods
  // @MX:WARN — @MX:REASON: Complex logic for period generation and status evaluation over time.
  // Optimized to avoid O(N^2) or O(N^3) complexity by precomputing timelines and using a single-pass aggregation.
  const periods: { key: string; end: Date }[] = [];
  let current = new Date(start);
  while (current <= end) {
    const key = getPeriodKey(current, interval);
    const periodEnd = getPeriodEnd(key, interval);
    periods.push({ key, end: periodEnd });

    if (interval === 'daily') current.setDate(current.getDate() + 1);
    else if (interval === 'weekly') current.setDate(current.getDate() + 7);
    else if (interval === 'monthly') current.setMonth(current.getMonth() + 1);
    if (periods.length > 1000) break;
  }

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
        status: sorted[0].fromStatus || allStatuses[0] || 'Open',
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
    timeline.forEach(interval => {
      // Find range of periods that fall into this interval
      // Since periods are sorted, we could use binary search, but for typical dashboard ranges
      // we can just find indices.
      for (const period of periods) {
        const time = period.end.getTime();
        if (time >= interval.start && time < interval.end) {
          const s = interval.status;
          periodCounts[period.key][s] = (periodCounts[period.key][s] || 0) + 1;
        }
      }
    });
  });

  // 5. Convert to TimeSeriesResult format
  return allStatuses.map(status => {
    const timeSeries: TimeSeriesResult['timeSeries'] = periods.map(period => {
      const count = periodCounts[period.key][status] || 0;
      return {
        period: period.key,
        date: period.end,
        value: count,
        count: count,
        isComplete: isPeriodComplete(period.end),
      };
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
  description: 'Number of tickets in each status over time (stacked area chart)',
  category: 'time-series',
  domain: 'throughput',
  unit: 'tickets',
  timeInterval: 'daily',
  calculate(context) {
    return calculateCumulativeFlow(context, 'daily');
  },
};

export default cumulativeFlowDailyPlugin;
