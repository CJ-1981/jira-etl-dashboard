/**
 * SLA Compliance Trend - Daily
 *
 * SLA compliance rate per day
 * 
 * @MX:NOTE: Tracks SLA compliance performance over time.
 * @MX:ANCHOR: SLA Trend - correlate speed with volume.
 * @MX:WARN: Accuracy depends on correctly configured SLA targets.
 * @MX:NOTE: Priority filtering is applied centrally by the KPI engine via
 * `globalFilters.priority` (see engine.buildPreprocessed) before issues reach
 * this plugin; a defensive in-plugin filter keeps direct invocations consistent.
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

function calculateSlaTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const slaTargetHours = context.holidays.slaTargetHours || 40;
  // @MX:NOTE: Apply priority filter defensively. The engine already narrows
  // context.issues via globalFilters, but plugins can also be invoked directly
  // (tests, workers), so honor context.globalFilters.priority here as well.
  const priorityFilter = context.globalFilters?.priority;
  const prioritySet = priorityFilter?.length
    ? new Set(priorityFilter.map((p) => p.toLowerCase()))
    : null;
  const resolvedIssues = context.issues.filter(
    (i) =>
      i.resolved &&
      (!prioritySet || (i.priority !== null && prioritySet.has(i.priority.toLowerCase())))
  );

  if (resolvedIssues.length === 0) {
    return [{
      name: 'SLA Compliance',
      value: 0,
      unit: '%',
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
    (issues) => {
      let complianceRate = 0;
      if (issues.length > 0) {
        const withinSla = issues.filter((issue) => {
          const hours = calculateBusinessHours(issue.created, issue.resolved!, {
            regions: context.holidays.regions,
            workStartHour: context.holidays.workStartHour,
            workEndHour: context.holidays.workEndHour,
            workDaysPerWeek: context.holidays.workDaysPerWeek,
          });
          return hours <= slaTargetHours;
        }).length;
        complianceRate = (withinSla / issues.length) * 100;
      }
      return { value: round2(complianceRate), count: issues.length };
    }
  );

  // Calculate overall compliance from complete periods only (weighted by count)
  const overallCompliance = weightedMeanOfCompletePeriods(timeSeries);

  const details: TimeSeriesResult['details'] = [
    { label: 'Complete Periods', value: timeSeries.filter(p => p.isComplete).length },
    { label: 'Total Resolved', value: resolvedIssues.length },
    { label: 'SLA Target', value: slaTargetHours, unit: 'hours' },
  ];

  // Surface the active priority filter (if any) so the trend is self-documenting
  if (priorityFilter && priorityFilter.length > 0) {
    details.push({ label: `Priority Filter (${priorityFilter.join(', ')})`, value: priorityFilter.length });
  }

  const completePoints = timeSeries.filter(p => p.isComplete);
  if (completePoints.length > 0) {
    const validPoints = completePoints.filter(p => p.count > 0);
    if (validPoints.length > 0) {
      const minCompliance = Math.min(...validPoints.map(t => t.value));
      const maxCompliance = Math.max(...validPoints.map(t => t.value));
      details.push(
        { label: 'Worst Period (Complete)', value: Math.round(minCompliance), unit: '%' },
        { label: 'Best Period (Complete)', value: Math.round(maxCompliance), unit: '%' }
      );
    }
  }

  if (hasIncompletePeriod) {
    details.push({ ...INCOMPLETE_PERIOD_DETAIL });
  }

  return [{
    name: 'SLA Compliance',
    value: round2(overallCompliance),
    unit: '%',
    timeSeries,
    details,
  }];
}

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const slaComplianceWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'sla_trend',
  name: 'SLA Trend',
  description: 'SLA compliance rate per week. Includes periods with zero activity.',
  category: 'time-series',
  domain: 'sla',
  version: '1.0.0',
  unit: '%',
  timeInterval: 'weekly',
  calculate(context) {
    return calculateSlaTrend(context, 'weekly');
  },
};

export default slaComplianceWeeklyPlugin;
