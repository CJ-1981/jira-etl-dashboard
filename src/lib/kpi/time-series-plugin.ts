/**
 * Time-Series KPI Plugin
 *
 * Generates time-series data for KPIs grouped by time intervals (daily, weekly, monthly)
 */

import { calculateBusinessHours } from '../holidays/german-holidays';
import { isIssueDone, type KpiPlugin, type KpiContext, type TransformedIssue, type StatusTransition } from './engine';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TimeSeriesResult {
  name: string;
  value: number;
  unit: string;
  timeSeries?: TimeSeriesDataPoint[];
  dimensions?: Record<string, string>;
  details?: Array<{
    label: string;
    value: number;
    unit?: string;
  }>;
}

export interface TimeSeriesDataPoint {
  period: string;
  date: Date;
  value: number;
  count: number;
  isComplete?: boolean;
}

export type TimeInterval = 'daily' | 'weekly' | 'monthly';

// ─── Time-Series Plugin ────────────────────────────────────────────────────────

/**
 * Processing Time Trend - Average processing hours grouped by time interval
 */
export const processingTimeTrendPlugin: KpiPlugin = {
  id: 'processing_time_trend',
  name: 'Processing Time Trend',
  description: 'Average business hours to resolve tickets, grouped by week/month/day',
  category: 'processing_time',
  unit: 'hours',
  calculate(context) {
    // Default to weekly grouping
    return calculateProcessingTimeTrend(context, 'weekly');
  },
};

/**
 * Throughput Trend - Tickets resolved per time interval
 */
export const throughputTrendPlugin: KpiPlugin = {
  id: 'throughput_trend',
  name: 'Throughput Trend',
  description: 'Number of tickets resolved per week/month/day',
  category: 'throughput',
  unit: 'tickets',
  calculate(context) {
    return calculateThroughputTrend(context, 'weekly');
  },
};

/**
 * SLA Trend - SLA compliance rate per time interval
 */
export const slaTrendPlugin: KpiPlugin = {
  id: 'sla_trend',
  name: 'SLA Trend',
  description: 'SLA compliance rate per week/month/day',
  category: 'sla',
  unit: '%',
  calculate(context) {
    return calculateSlaTrend(context, 'weekly');
  },
};

/**
 * Turnaround Time by Status Trend - Average time in each status per time period
 */
export const timeInStatusTrendPlugin: KpiPlugin = {
  id: 'time_in_status_trend',
  name: 'Turnaround Time by Status Trend',
  description: 'Average business hours tickets spend in each workflow status, grouped by week',
  category: 'turnaround',
  unit: 'hours',
  calculate(context) {
    return calculateTimeInStatusTrend(context, 'weekly');
  },
};

/**
 * SLA Compliance by Status Trend - SLA compliance rate for each workflow status per time period
 */
export const slaByStatusTrendPlugin: KpiPlugin = {
  name: 'SLA Compliance by Status Trend',
  id: 'sla_by_status_trend',
  description: 'SLA compliance rate for each workflow status, grouped by week',
  category: 'sla',
  unit: '%',
  calculate(context) {
    return calculateSlaByStatusTrend(context, 'weekly');
  },
};

/**
 * SLA Compliance by Status (Excl. Clones) Trend - SLA compliance rate for each workflow status per time period, excluding clones.
 */
export const slaByStatusExclCloneTrendPlugin: KpiPlugin = {
  id: 'sla_by_status_excl_clone_trend',
  name: 'SLA Compliance by Status Trend (Excl. Clones)',
  description: 'SLA compliance rate for each workflow status, excluding tickets with "CLONE" in the title, grouped by week',
  category: 'sla',
  unit: '%',
  calculate(context) {
    // Filter out tickets with "CLONE" in summary (case-sensitive as requested)
    const filteredContext = {
      ...context,
      issues: context.issues.filter(issue => !issue.summary.includes('CLONE'))
    };
    return calculateSlaByStatusTrend(filteredContext, 'weekly');
  },
};

/**
 * Open Tickets by Assignee Trend - Number of open tickets per assignee over time
 */
export const openTicketsByAssigneeTrendPlugin: KpiPlugin = {
  id: 'open_tickets_by_assignee_trend',
  name: 'Open Tickets by Assignee Trend',
  description: 'Number of open (non-resolved) tickets per assignee over time, grouped by week',
  category: 'assignee',
  unit: 'tickets',
  calculate(context) {
    return calculateOpenTicketsByAssigneeTrend(context, 'weekly');
  },
};

// ─── Calculation Functions ─────────────────────────────────────────────────────

function calculateOpenTicketsByAssigneeTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  // We need to look at all issues that were open at ANY point during the period
  // but specifically we want to know how many were open at the END of each period.
  
  const allIssues = context.issues;
  if (allIssues.length === 0) {
    return [{
      name: 'Open Tickets by Assignee',
      value: 0,
      unit: 'tickets',
      timeSeries: [],
    }];
  }

  // Define the time range to analyze
  const { start, end } = context.period;
  
  // Generate periods
  const periods: { key: string; end: Date }[] = [];
  let current = new Date(start);
  while (current <= end) {
    const key = getPeriodKey(current, interval);
    const periodEnd = getPeriodEnd(key, interval);
    periods.push({ key, end: periodEnd });
    
    // Move to next period
    if (interval === 'daily') current.setDate(current.getDate() + 1);
    else if (interval === 'weekly') current.setDate(current.getDate() + 7);
    else if (interval === 'monthly') current.setMonth(current.getMonth() + 1);
    
    // Avoid infinite loop if somehow date doesn't progress
    if (periods.length > 1000) break;
  }

  // Get all unique assignees
  const allAssignees = new Set<string>();
  allIssues.forEach(i => allAssignees.add(i.assignee || 'Unassigned'));

  const assigneeResults: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  for (const assignee of allAssignees) {
    const timeSeries: TimeSeriesDataPoint[] = [];
    const assigneeIssues = allIssues.filter(i => (i.assignee || 'Unassigned') === assignee);

    for (const period of periods) {
      const isComplete = isPeriodComplete(period.end);
      if (!isComplete) {
        hasIncompletePeriod = true;
      }

      // Count issues that were created before/at period end AND (not resolved OR resolved after period end)
      const openAtEnd = assigneeIssues.filter(i => {
        const createdDate = i.created;
        const resolvedDate = i.resolved;
        
        const wasCreated = createdDate <= period.end;
        const isActuallyDone = isIssueDone(i);
        const wasNotYetResolved = (!resolvedDate && !isActuallyDone) || (resolvedDate && resolvedDate > period.end);
        
        return wasCreated && wasNotYetResolved;
      }).length;

      timeSeries.push({
        period: period.key,
        date: period.end,
        value: openAtEnd,
        count: openAtEnd,
        isComplete,
      });
    }

    // Sort by date
    timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Current value issues (at last complete period end)
    const completePoints = timeSeries.filter(p => p.isComplete);
    const lastCompletePeriod = periods.filter(p => isPeriodComplete(p.end)).pop();
    const currentTicketKeys = lastCompletePeriod 
      ? assigneeIssues.filter(i => {
          const isActuallyDone = isIssueDone(i);
          const wasNotYetResolved = (!i.resolved && !isActuallyDone) || (i.resolved && i.resolved > lastCompletePeriod.end);
          return i.created <= lastCompletePeriod.end && wasNotYetResolved;
        }).map(i => i.key)
      : [];

    // Current value (at last complete period end)
    const currentValue = completePoints.length > 0 ? completePoints[completePoints.length - 1].value : 0;

    assigneeResults.push({
      name: `Open Tickets: ${assignee}`,
      value: currentValue,
      unit: 'tickets',
      dimensions: { assignee },
      ticketKeys: currentTicketKeys,
      timeSeries,
    });
  }

  // Add info to details if incomplete period is shown
  if (hasIncompletePeriod && assigneeResults.length > 0) {
    assigneeResults[0].details = [
      { label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' }
    ];
  }

  return assigneeResults;
}

function calculateProcessingTimeTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'Avg. Processing Time',
      value: 0,
      unit: 'hours',
      timeSeries: [],
    }];
  }

  // Group issues by time interval
  const grouped = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved!);

  // Calculate average processing time per period, filtering incomplete periods
  const timeSeries: TimeSeriesDataPoint[] = [];
  let hasIncompletePeriod = false;

  for (const [periodKey, issues] of Object.entries(grouped)) {
    const periodEnd = getPeriodEnd(periodKey, interval);
    const isComplete = isPeriodComplete(periodEnd);

    if (!isComplete) {
      hasIncompletePeriod = true;
    }

    const processingTimes = issues.map((issue) =>
      calculateBusinessHours(issue.created, issue.resolved!, context.holidays)
    );

    const avgTime = processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;

    timeSeries.push({
      period: periodKey,
      date: periodEnd,
      value: Math.round(avgTime * 100) / 100,
      count: issues.length,
      isComplete: isComplete,
    });
  }

  // Sort by date
  timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

  // Calculate overall average from complete periods only
  const completePoints = timeSeries.filter(p => p.isComplete);
  const overallAvg = completePoints.length > 0
    ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) /
      completePoints.reduce((sum, point) => sum + point.count, 0)
    : 0;

  const details: Array<{ label: string; value: number; unit?: string }> = [
    { label: 'Complete Periods', value: completePoints.length },
    { label: 'Total Resolved', value: resolvedIssues.length },
  ];

  if (completePoints.length > 0) {
    details.push(
      { label: 'Min Time (Complete)', value: Math.round(Math.min(...completePoints.map(t => t.value)) * 100) / 100, unit: 'hours' },
      { label: 'Max Time (Complete)', value: Math.round(Math.max(...completePoints.map(t => t.value)) * 100) / 100, unit: 'hours' }
    );
  }

  if (hasIncompletePeriod) {
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  return [{
    name: 'Avg. Processing Time',
    value: Math.round(overallAvg * 100) / 100,
    unit: 'hours',
    timeSeries,
    details,
  }];
}

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

  // Group issues by time interval
  const grouped = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved!);

  // Calculate throughput per period, filtering incomplete periods
  const timeSeries: TimeSeriesDataPoint[] = [];
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

  // Sort by date
  timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

  const completePoints = timeSeries.filter(p => p.isComplete);
  const totalResolvedInComplete = completePoints.reduce((sum, p) => sum + p.value, 0);
  const avgThroughput = completePoints.length > 0 ? totalResolvedInComplete / completePoints.length : 0;

  const details: Array<{ label: string; value: number; unit?: string }> = [
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

  // Group issues by time interval
  const grouped = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved!);

  // Calculate SLA compliance per period, filtering incomplete periods
  const timeSeries: TimeSeriesDataPoint[] = [];
  let hasIncompletePeriod = false;

  for (const [periodKey, issues] of Object.entries(grouped)) {
    const periodEnd = getPeriodEnd(periodKey, interval);
    const isComplete = isPeriodComplete(periodEnd);

    if (!isComplete) {
      hasIncompletePeriod = true;
    }

    const withinSla = issues.filter((issue) => {
      const hours = calculateBusinessHours(issue.created, issue.resolved!, context.holidays);
      return hours <= slaTargetHours;
    }).length;

    const complianceRate = (withinSla / issues.length) * 100;

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
  const overallCompliance = completePoints.length > 0
    ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) /
      completePoints.reduce((sum, point) => sum + point.count, 0)
    : 0;

  const details: Array<{ label: string; value: number; unit?: string }> = [
    { label: 'Complete Periods', value: completePoints.length },
    { label: 'Total Resolved', value: resolvedIssues.length },
    { label: 'SLA Target', value: slaTargetHours, unit: 'hours' },
  ];

  if (completePoints.length > 0) {
    const minCompliance = Math.min(...completePoints.map(t => t.value));
    const maxCompliance = Math.max(...completePoints.map(t => t.value));
    details.push(
      { label: 'Worst Period (Complete)', value: Math.round(minCompliance), unit: '%' },
      { label: 'Best Period (Complete)', value: Math.round(maxCompliance), unit: '%' }
    );
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

  // Group issues by time interval (based on resolution date)
  const groupedByPeriod = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved!);

  // For each period, calculate time in each status
  const periodStatusData: Record<string, Record<string, { totalHours: number; count: number }>> = {};

  for (const [periodKey, periodIssues] of Object.entries(groupedByPeriod)) {
    periodStatusData[periodKey] = {};

    for (const issue of periodIssues) {
      for (const transition of issue.transitions) {
        const status = transition.toStatus;
        const nextTime = issue.transitions[issue.transitions.indexOf(transition) + 1]
          ? issue.transitions[issue.transitions.indexOf(transition) + 1].occurredAt
          : issue.resolved!;

        const hours = calculateBusinessHours(transition.occurredAt, nextTime, context.holidays);

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
  const allStatuses = new Set<string>();
  for (const periodData of Object.values(periodStatusData)) {
    Object.keys(periodData).forEach(status => allStatuses.add(status));
  }

  // For each status, create a time-series result
  for (const status of allStatuses) {
    const timeSeries: TimeSeriesDataPoint[] = [];

    for (const [periodKey, periodData] of Object.entries(periodStatusData)) {
      const statusData = periodData[status];
      if (!statusData) continue; // This status didn't appear in this period

      const periodEnd = getPeriodEnd(periodKey, interval);
      const isComplete = isPeriodComplete(periodEnd);

      if (!isComplete) {
        hasIncompletePeriod = true;
      }

      const avgHours = statusData.count > 0 ? statusData.totalHours / statusData.count : 0;

      timeSeries.push({
        period: periodKey,
        date: periodEnd,
        value: Math.round(avgHours * 100) / 100,
        count: statusData.count,
        isComplete,
      });
    }

    // Sort by date
    timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate overall average for this status from complete periods only
    const completePoints = timeSeries.filter(p => p.isComplete);
    const overallAvg = completePoints.length > 0
      ? completePoints.reduce((sum, point) => sum + point.value, 0) / completePoints.length
      : 0;

    statusResults.push({
      name: `Time in ${status}`,
      value: Math.round(overallAvg * 100) / 100,
      unit: 'hours',
      dimensions: { status },
      timeSeries,
    });
  }

  const details: Array<{ label: string; value: number; unit?: string }> = [
    { label: 'Statuses Analyzed', value: statusResults.length },
  ];

  if (hasIncompletePeriod) {
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  // Return multiple results (one per status) for multi-line chart
  return statusResults;
}

function calculateSlaByStatusTrend(
  context: KpiContext,
  interval: TimeInterval
): TimeSeriesResult[] {
  const resolvedIssues = context.issues.filter((i) => i.resolved);

  if (resolvedIssues.length === 0) {
    return [{
      name: 'SLA Compliance by Status',
      value: 0,
      unit: '%',
      timeSeries: [],
    }];
  }

  // Get SLA targets for each status from context
  const slaTargets = context.slaTargets || {};
  const defaultSlaHours = context.holidays.slaTargetHours || 40;

  // Group issues by time interval (based on resolution date)
  const groupedByPeriod = groupByTimeInterval(resolvedIssues, interval, (issue) => issue.resolved!);

  // For each period, calculate SLA compliance for each status
  const periodStatusData: Record<string, Record<string, { withinSla: number; total: number }>> = {};

  for (const [periodKey, periodIssues] of Object.entries(groupedByPeriod)) {
    periodStatusData[periodKey] = {};

    for (const issue of periodIssues) {
      // Determine which status to measure SLA against
      // Use the final status before resolution
      const finalStatus = issue.transitions.length > 0
        ? issue.transitions[issue.transitions.length - 1].toStatus
        : issue.status;

      // Get SLA target for this status
      const slaTargetHours = slaTargets[finalStatus] || defaultSlaHours;

      // Calculate if this issue met SLA
      const hours = calculateBusinessHours(issue.created, issue.resolved!, context.holidays);
      const withinSla = hours <= slaTargetHours;

      if (!periodStatusData[periodKey][finalStatus]) {
        periodStatusData[periodKey][finalStatus] = { withinSla: 0, total: 0 };
      }

      periodStatusData[periodKey][finalStatus].total++;
      if (withinSla) {
        periodStatusData[periodKey][finalStatus].withinSla++;
      }
    }
  }

  // Build time-series data - multiple results (one per status) for multi-line chart
  const statusResults: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  // Get all unique statuses across all periods
  const allStatuses = new Set<string>();
  for (const periodData of Object.values(periodStatusData)) {
    Object.keys(periodData).forEach(status => allStatuses.add(status));
  }

  // For each status, create a time-series result
  for (const status of allStatuses) {
    const timeSeries: TimeSeriesDataPoint[] = [];

    for (const [periodKey, periodData] of Object.entries(periodStatusData)) {
      const statusData = periodData[status];
      if (!statusData) continue; // This status didn't appear in this period

      const periodEnd = getPeriodEnd(periodKey, interval);
      const isComplete = isPeriodComplete(periodEnd);

      if (!isComplete) {
        hasIncompletePeriod = true;
      }

      const complianceRate = statusData.total > 0
        ? (statusData.withinSla / statusData.total) * 100
        : 0;

      timeSeries.push({
        period: periodKey,
        date: periodEnd,
        value: Math.round(complianceRate * 100) / 100,
        count: statusData.total,
        isComplete,
      });
    }

    // Sort by date
    timeSeries.sort((a, b) => a.date.getTime() - b.date.getTime());

    // Calculate overall compliance for this status from complete periods only
    const completePoints = timeSeries.filter(p => p.isComplete);
    const overallCompliance = completePoints.length > 0
      ? completePoints.reduce((sum, point) => sum + point.value * point.count, 0) /
        completePoints.reduce((sum, point) => sum + point.count, 0)
      : 0;

    statusResults.push({
      name: `SLA Compliance - ${status}`,
      value: Math.round(overallCompliance * 100) / 100,
      unit: '%',
      dimensions: { status },
      timeSeries,
    });
  }

  const details: Array<{ label: string; value: number; unit?: string }> = [
    { label: 'Statuses Analyzed', value: statusResults.length },
  ];

  if (hasIncompletePeriod) {
    details.push({ label: 'ℹ️ Current period incomplete', value: 1, unit: 'partial' });
  }

  // Return multiple results (one per status) for multi-line chart
  return statusResults;
}

// ─── Utility Functions ─────────────────────────────────────────────────────────

/**
 * Group issues by time interval
 */
function groupByTimeInterval(
  issues: TransformedIssue[],
  interval: TimeInterval,
  dateExtractor: (issue: TransformedIssue) => Date
): Record<string, TransformedIssue[]> {
  const grouped: Record<string, TransformedIssue[]> = {};

  for (const issue of issues) {
    const date = dateExtractor(issue);
    const key = getPeriodKey(date, interval);

    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(issue);
  }

  return grouped;
}

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
  const [yearStr, rest] = periodKey.split('-');
  const year = parseInt(yearStr, 10);

  switch (interval) {
    case 'daily':
      return new Date(year, parseInt(rest.split('-')[0], 10) - 1, parseInt(rest.split('-')[1], 10));
    case 'weekly':
      const week = parseInt(rest.replace('W', ''), 10);
      return getWeekEndDate(year, week);
    case 'monthly':
      const month = parseInt(rest, 10);
      return new Date(year, month, 0); // Last day of month
    default:
      return new Date();
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

// ─── Plugin Registration Helper ────────────────────────────────────────────────

/**
 * Register all time-series plugins with the KPI engine
 */
export function registerTimeSeriesPlugins(engine: { register: (plugin: KpiPlugin) => void }): void {
  engine.register(processingTimeTrendPlugin);
  engine.register(throughputTrendPlugin);
  engine.register(slaTrendPlugin);
  engine.register(timeInStatusTrendPlugin);
  engine.register(slaByStatusTrendPlugin);
  engine.register(slaByStatusExclCloneTrendPlugin);
  engine.register(openTicketsByAssigneeTrendPlugin);
}
