/**
 * Open Tickets by Assignee Trend (Daily / Weekly / Monthly)
 *
 * Number of open (non-resolved) tickets per assignee over time.
 * A shared calculation is instantiated per interval via a plugin factory.
 * 
 * @MX:NOTE: Tracks individual workload distribution over time.
 * @MX:WARN: Relies on resolution date; tickets without one are considered open.
 * @MX:ANCHOR: Assignee Trend - monitor team capacity evolution.
 * @MX:NOTE: Interval variants are produced by createOpenTicketsByAssigneeTrendPlugin;
 * the weekly variant keeps its historical id/name for backward compatibility.
 */

import { isIssueDone } from '../../../engine-utils';
import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult, TimeInterval } from '../../../types-time-series';
import { 
  getPeriodEnd, 
  isPeriodComplete, 
  enumeratePeriodKeys 
} from '../../../utils/time-series-utils';

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
  const allPeriodKeys = enumeratePeriodKeys(start, end, interval);
  const periods = allPeriodKeys.map(key => ({
    key,
    end: getPeriodEnd(key, interval)
  }));

  // Get all unique assignees
  const allAssignees = new Set<string>();
  allIssues.forEach(i => allAssignees.add(i.assignee || 'Unassigned'));

  const assigneeResults: TimeSeriesResult[] = [];
  let hasIncompletePeriod = false;

  const isOpenAtEnd = (issue: any, periodEnd: Date) => {
    const createdDate = issue.created;
    const resolvedDate = issue.resolved;

    const wasCreated = createdDate <= periodEnd;
    const isActuallyDone = isIssueDone(issue);
    const wasNotYetResolved = (!resolvedDate && !isActuallyDone) || (resolvedDate && resolvedDate > periodEnd);

    return wasCreated && wasNotYetResolved;
  };

  for (const assignee of allAssignees) {
    const timeSeries: TimeSeriesResult['timeSeries'] = [];
    const assigneeIssues = allIssues.filter(i => (i.assignee || 'Unassigned') === assignee);

    for (const period of periods) {
      const isComplete = isPeriodComplete(period.end);
      if (!isComplete) {
        hasIncompletePeriod = true;
      }

      // Count issues that were created before/at period end AND (not resolved OR resolved after period end)
      const openAtEnd = assigneeIssues.filter(i => isOpenAtEnd(i, period.end)).length;

      timeSeries.push({
        period: period.key,
        date: period.end,
        value: openAtEnd,
        count: openAtEnd,
        isComplete,
      });
    }

    // Sort by date
    // @MX:WARN: `new Date(...)` normalizes `Date | string` (ISO string after JSON API round-trip)
    timeSeries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Current value issues (at last complete period end)
    const completePoints = timeSeries.filter(p => p.isComplete);
    const lastCompletePeriod = periods.filter(p => isPeriodComplete(p.end)).pop();
    const currentTicketKeys = lastCompletePeriod
      ? assigneeIssues.filter(i => isOpenAtEnd(i, lastCompletePeriod.end)).map(i => i.key)
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

// ─── Plugin Factory ────────────────────────────────────────────────────────────

const INTERVAL_NOUN: Record<TimeInterval, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
};

/**
 * Build an open-tickets-by-assignee trend plugin for a specific interval.
 * The calculation logic is interval-agnostic; only the period bucketing differs.
 */
function createOpenTicketsByAssigneeTrendPlugin(
  interval: TimeInterval
): KpiPlugin<TimeSeriesResult[]> {
  return {
    id: `open_tickets_by_assignee_trend_${interval}`,
    name: `Open Tickets by Assignee Trend (${interval})`,
    description: `Number of open (non-resolved) tickets per assignee over time, grouped by ${INTERVAL_NOUN[interval]}. Includes periods with zero tickets.`,
    category: 'time-series',
    domain: 'assignee',
    version: '1.0.0',
    unit: 'tickets',
    timeInterval: interval,
    calculate(context) {
      return calculateOpenTicketsByAssigneeTrend(context, interval);
    },
  };
}

// ─── Plugin Definitions ────────────────────────────────────────────────────────

export const openTicketsByAssigneeDailyPlugin = createOpenTicketsByAssigneeTrendPlugin('daily');
export const openTicketsByAssigneeMonthlyPlugin = createOpenTicketsByAssigneeTrendPlugin('monthly');

// The weekly plugin keeps its historical id (no interval suffix) so existing
// dashboards, configs and tests continue to reference it unchanged.
const openTicketsByAssigneeWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  ...createOpenTicketsByAssigneeTrendPlugin('weekly'),
  id: 'open_tickets_by_assignee_trend',
  name: 'Open Tickets by Assignee Trend',
  description: 'Number of open (non-resolved) tickets per assignee over time, grouped by week. Includes periods with zero tickets.',
};

export default openTicketsByAssigneeWeeklyPlugin;
