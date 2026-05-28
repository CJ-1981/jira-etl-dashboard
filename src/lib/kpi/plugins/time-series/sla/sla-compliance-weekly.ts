/**
 * SLA Compliance Trend - Daily
 *
 * SLA compliance rate per day
 * 
 * @MX:NOTE: Tracks SLA compliance performance over time.
 * @MX:ANCHOR: SLA Trend - correlate speed with volume.
 * @MX:WARN: Accuracy depends on correctly configured SLA targets.
 * @MX:TODO: Integrate with specific priority filtering.
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import { 
  getPeriodEnd, 
  isPeriodComplete, 
  groupByTimeInterval, 
  enumeratePeriodKeys 
} from '../../../utils/time-series-utils';

// ─── Calculation Function ───────────────────────────────────────────────────────

function calculateSlaTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const slaTargetHours = context.holidays.slaTargetHours || 40;
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'SLA Compliance',
      value: 0,
      unit: '%',
      timeSeries: [],
    }];
  }

  // 1. Group issues by time interval
  const grouped = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved);

  // 2. Ensure all periods in range are represented
  const resolvedDates = resolvedIssues.map(i => new Date(i.resolved!).getTime());
  const minDate = new Date(Math.min(...resolvedDates));
  const maxDate = new Date(Math.max(...resolvedDates, context.period.end.getTime()));
  
  const allPeriodKeys = enumeratePeriodKeys(minDate, maxDate, interval);
  for (const key of allPeriodKeys) {
    if (!grouped[key]) {
      grouped[key] = [];
    }
  }

  // 3. Calculate SLA compliance per period
  const timeSeries: TimeSeriesResult['timeSeries'] = [];
  let hasIncompletePeriod = false;

  for (const [periodKey, issues] of Object.entries(grouped)) {
    const periodEnd = getPeriodEnd(periodKey, interval);
    const isComplete = isPeriodComplete(periodEnd);

    if (!isComplete) {
      hasIncompletePeriod = true;
    }

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

    timeSeries.push({
      period: periodKey,
      date: periodEnd,
      value: Math.round(complianceRate * 100) / 100,
      count: issues.length,
      isComplete,
    });
  }

  // Sort by date
  timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate overall compliance from complete periods only
  const completePoints = timeSeries.filter(p => p.isComplete);
  const totalCountInComplete = completePoints.reduce((sum, point) => sum + point.count, 0);
  const overallCompliance = totalCountInComplete > 0
    ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) / totalCountInComplete
    : 0;

  const details: TimeSeriesResult['details'] = [
    { label: 'Complete Periods', value: completePoints.length },
    { label: 'Total Resolved', value: resolvedIssues.length },
    { label: 'SLA Target', value: slaTargetHours, unit: 'hours' },
  ];

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
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  return [{
    name: 'SLA Compliance',
    value: Math.round(overallCompliance * 100) / 100,
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
