/**
 * Open Tickets by Assignee Trend - Weekly
 *
 * Number of open (non-resolved) tickets per assignee over time, grouped by week
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
    const timeSeries: TimeSeriesResult['timeSeries'] = [];
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
    timeSeries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const openTicketsByAssigneeWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'open_tickets_by_assignee_trend',
  name: 'Open Tickets by Assignee Trend',
  description: 'Number of open (non-resolved) tickets per assignee over time, grouped by week',
  category: 'time-series',
  domain: 'assignee',
  version: '1.0.0',
  unit: 'tickets',
  timeInterval: 'weekly',
  calculate(context) {
    return calculateOpenTicketsByAssigneeTrend(context, 'weekly');
  },
};

export default openTicketsByAssigneeWeeklyPlugin;
