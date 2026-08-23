/**
 * SLA Compliance by Status Trend - Weekly
 *
 * SLA compliance rate for each workflow status per week
 * Tracks every status transition against its specific SLA target
 * 
 * @MX:NOTE: Tracks SLA compliance trends per workflow status.
 * @MX:ANCHOR: SLA Status Trend - pinpoint bottleneck stages.
 * @MX:WARN: Only counts completed status durations to avoid partial data bias.
 * @MX:NOTE: Each status result carries its own target via `slaTargetHours` so the
 * chart layer can render a per-series target reference line.
 * @MX:NOTE: Applies the same comment-based SLA clock reset as the builtin
 * sla_by_status card so card and trend buckets agree.
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import { getPeriodKey } from '../../../utils/time-series-utils';
import {
  resolveTrendPeriods,
  buildSnapshotPoints,
  weightedMeanOfCompletePeriods,
  round2,
  INCOMPLETE_PERIOD_DETAIL,
} from '../../../utils/trend-scaffold';
import { enumeratePeriodKeys } from '../../../utils/time-series-utils';

// ─── Calculation Function ───────────────────────────────────────────────────────

/**
 * Options controlling how the SLA clock is measured for each status duration.
 */
export interface SlaByStatusTrendOptions {
  /**
   * When true, the SLA clock resets to the last relevant comment within the
   * status window, mirroring the builtin `sla_by_status` card. A comment is
   * relevant when it was authored by the assignee (or by anyone when
   * `context.useAnyoneCommentsForSla` is set) and falls inside the window.
   */
  useCommentBasedReset?: boolean;
}

export function calculateSlaByStatusTrend(
  context: KpiContext,
  interval: TimeInterval,
  options?: SlaByStatusTrendOptions
): TimeSeriesResult[] {
  // Get SLA targets for each status from context
  const targets = (context.slaTargets || {}) as Record<string, number>;
  const targetEntries = (Object.entries(targets) as [string, number][]).filter(([, h]) => h > 0);
  
  if (targetEntries.length === 0 || context.issues.length === 0) {
    return [{
      name: 'SLA Compliance by Status Trend',
      value: 0,
      unit: '%',
      timeSeries: [],
    }];
  }

  const targetStatuses = new Set(targetEntries.map(([s]) => s));

  // Period -> Status -> { withinSla, total }
  const periodStatusData: Record<string, Record<string, { withinSla: number; total: number }>> = {};
  const allExitDates: Date[] = [];

  for (const issue of context.issues) {
    // Process each transition to check SLA for each status it passed through
    for (let i = 0; i < issue.transitions.length; i++) {
      const transition = issue.transitions[i];
      const status = transition.toStatus;

      // Only track statuses that have an SLA target
      if (!targetStatuses.has(status)) continue;

      const statusEntry = transition.occurredAt;
      const nextTransition = issue.transitions[i + 1];
      
      // The status "ends" at the next transition or when the issue is resolved
      const statusExit = nextTransition ? nextTransition.occurredAt : issue.resolved;

      // If not resolved and no next transition, it's still in this status (aging)
      // For Trend charts, we usually only count COMPLETED status durations to avoid partial data bias
      if (!statusExit) continue;

      allExitDates.push(statusExit);

      // @MX:NOTE: Optional comment-based clock reset keeps the trend consistent
      // with the builtin sla_by_status card (see sla-by-status.ts).
      let slaStart = statusEntry;
      if (options?.useCommentBasedReset) {
        const relevantComments = issue.comments.filter((c) => {
          const authorMatch = context.useAnyoneCommentsForSla || c.author === issue.assignee;
          return authorMatch && c.created >= statusEntry && c.created <= statusExit;
        });
        if (relevantComments.length > 0) {
          slaStart = relevantComments[relevantComments.length - 1].created;
        }
      }

      const targetHours = targets[status];

      // Calculate business hours spent in this status
      const hours = calculateBusinessHours(slaStart, statusExit, {
        regions: context.holidays.regions,
        workStartHour: context.holidays.workStartHour,
        workEndHour: context.holidays.workEndHour,
        workDaysPerWeek: context.holidays.workDaysPerWeek,
      });

      const metSla = hours <= targetHours;
      const periodKey = getPeriodKey(statusExit, interval);

      if (!periodStatusData[periodKey]) {
        periodStatusData[periodKey] = {};
      }
      if (!periodStatusData[periodKey][status]) {
        periodStatusData[periodKey][status] = { withinSla: 0, total: 0 };
      }

      periodStatusData[periodKey][status].total++;
      if (metSla) {
        periodStatusData[periodKey][status].withinSla++;
      }
    }
  }

  // 2. Ensure all periods in range are represented
  if (allExitDates.length > 0) {
    const minDate = new Date(Math.min(...allExitDates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...allExitDates.map(d => d.getTime()), context.period.end.getTime()));
    const allPeriodKeys = enumeratePeriodKeys(minDate, maxDate, interval);

    for (const key of allPeriodKeys) {
      if (!periodStatusData[key]) {
        periodStatusData[key] = {};
      }
      for (const status of targetStatuses) {
        if (!periodStatusData[key][status]) {
          periodStatusData[key][status] = { withinSla: 0, total: 0 };
        }
      }
    }
  }

  // Build time-series data - multiple results (one per status)
  const statusResults: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  // Resolve the shared period axis once (chronological, zero-filled above)
  const periods = resolveTrendPeriods(Object.keys(periodStatusData).sort(), interval);

  // For each status that has a target
  for (const [status, targetHours] of targetEntries) {
    const { points: timeSeries, hasIncompletePeriod: incomplete } = buildSnapshotPoints(
      periods,
      (period) => {
        const statusData = periodStatusData[period.key]?.[status];
        if (!statusData) {
          return { value: 0, count: 0 };
        }
        const complianceRate = statusData.total > 0
          ? (statusData.withinSla / statusData.total) * 100
          : 0;
        return { value: round2(complianceRate), count: statusData.total };
      }
    );
    if (incomplete) hasIncompletePeriod = true;

    if (timeSeries.length === 0) continue;

    // Calculate overall compliance for this status from complete periods only
    const overallCompliance = weightedMeanOfCompletePeriods(timeSeries);

    statusResults.push({
      name: `SLA Compliance - ${status}`,
      value: round2(overallCompliance),
      unit: '%',
      dimensions: { status },
      slaTargetHours: targetHours,
      timeSeries,
      details: [
        { label: 'Target', value: targetHours, unit: 'hours' },
        { label: 'Total Occurrences', value: timeSeries.reduce((sum, p) => sum + p.count, 0) }
      ]
    });
  }

  // Sort results by status name for consistent UI
  statusResults.sort((a, b) => a.name.localeCompare(b.name));

  if (hasIncompletePeriod && statusResults.length > 0) {
    statusResults[0].details?.push({ ...INCOMPLETE_PERIOD_DETAIL });
  }

  return statusResults;
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const slaByStatusWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'sla_by_status_trend',
  name: 'SLA Compliance by Status Trend',
  description: 'SLA compliance rate for each workflow status, grouped by week. Only counts completed status durations.',
  category: 'time-series',
  domain: 'sla',
  version: '1.0.0',
  unit: '%',
  timeInterval: 'weekly',
  calculate(context) {
    // Comment-based clock reset enabled to stay consistent with the
    // builtin sla_by_status card.
    return calculateSlaByStatusTrend(context, 'weekly', { useCommentBasedReset: true });
  },
};

export default slaByStatusWeeklyPlugin;
