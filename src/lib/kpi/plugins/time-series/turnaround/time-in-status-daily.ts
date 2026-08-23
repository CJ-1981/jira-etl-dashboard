/**
 * Turnaround Time by Status Trend (Daily / Weekly / Monthly)
 *
 * Average business hours tickets spend in each workflow status.
 * A shared calculation is instantiated per interval via a plugin factory.
 * 
 * @MX:NOTE: Tracks turnaround time trends by status.
 * @MX:WARN: Only counts completed status durations to avoid partial data bias.
 * @MX:ANCHOR: Turnaround Trend - visualize bottleneck evolution.
 * @MX:NOTE: Interval variants are produced by createTimeInStatusTrendPlugin;
 * the daily variant keeps its historical id/name for backward compatibility.
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import {
  preparePeriods,
  resolveTrendPeriods,
  buildSnapshotPoints,
  weightedMeanOfCompletePeriods,
  round2,
  INCOMPLETE_PERIOD_DETAIL,
} from '../../../utils/trend-scaffold';

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

  // Group issues by interval (resolution date) and zero-fill all periods in range
  const resolvedDates = resolvedIssues.map(i => i.resolved!.getTime());
  const minDate = new Date(Math.min(...resolvedDates));
  const maxDate = new Date(Math.max(...resolvedDates, context.period.end.getTime()));
  const groupedByPeriod = preparePeriods(resolvedIssues, interval, (issue) => issue.resolved, minDate, maxDate);

  // For each period, calculate time in each status
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

  // Resolve the shared period axis once (chronological, zero-filled above)
  const periods = resolveTrendPeriods(Object.keys(periodStatusData).sort(), interval);

  // For each status, create a time-series result
  for (const status of allStatuses) {
    const { points: timeSeries, hasIncompletePeriod: incomplete } = buildSnapshotPoints(
      periods,
      (period) => {
        const statusData = periodStatusData[period.key]?.[status] ?? { totalHours: 0, count: 0 };
        const avgHours = statusData.count > 0 ? statusData.totalHours / statusData.count : 0;
        return { value: round2(avgHours), count: statusData.count };
      }
    );
    if (incomplete) hasIncompletePeriod = true;

    // Calculate overall average for this status from complete periods only
    const overallAvg = weightedMeanOfCompletePeriods(timeSeries, true);

    statusResults.push({
      name: `Time in ${status}`,
      value: round2(overallAvg),
      unit: 'hours',
      dimensions: { status },
      timeSeries,
    });
  }

  if (hasIncompletePeriod && statusResults.length > 0) {
    statusResults[0].details = statusResults[0].details || [];
    statusResults[0].details.push({ ...INCOMPLETE_PERIOD_DETAIL });
  }

  // Return multiple results (one per status) for multi-line chart
  return statusResults;
}

// ─── Plugin Factory ────────────────────────────────────────────────────────────

const INTERVAL_NOUN: Record<TimeInterval, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

const INTERVAL_LABEL: Record<TimeInterval, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

/**
 * Build a time-in-status trend plugin for a specific interval.
 * The calculation logic is interval-agnostic; only the period bucketing differs.
 */
function createTimeInStatusTrendPlugin(
  interval: TimeInterval
): KpiPlugin<TimeSeriesResult[]> {
  return {
    id: `time_in_status_trend_${interval}`,
    name: `Time In Status Trend (${INTERVAL_LABEL[interval]})`,
    description: `Average business hours tickets spend in each workflow status, grouped by ${INTERVAL_NOUN[interval]}`,
    category: 'time-series',
    domain: 'turnaround',
    version: '1.0.0',
    unit: 'hours',
    timeInterval: interval,
    calculate(context) {
      return calculateTimeInStatusTrend(context, interval);
    },
  };
}

// ─── Plugin Definitions ────────────────────────────────────────────────────────────

export const timeInStatusWeeklyPlugin = createTimeInStatusTrendPlugin('weekly');
export const timeInStatusMonthlyPlugin = createTimeInStatusTrendPlugin('monthly');

// The daily plugin is the historical default; keep its id/name unchanged.
const timeInStatusDailyPlugin: KpiPlugin<TimeSeriesResult[]> = createTimeInStatusTrendPlugin('daily');

export default timeInStatusDailyPlugin;
