/**
 * Time In Status Plugin
 * Calculates average business hours tickets spend in each workflow status
 * Accounts for initial status before first transition
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const timeInStatusPlugin: KpiPlugin = {
  id: 'time_in_status',
  name: 'Time In Status',
  description: 'Average business hours tickets spend in each workflow status.',
  category: 'builtin',
  domain: 'turnaround',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'hours',

  calculate(context: KpiContext): KpiResult[] {
    const statusHours: Record<string, { total: number; count: number; issueCount: number }> = {};
    const issuesPerStatus: Record<string, Set<string>> = {};

    for (const issue of context.issues) {
      const seen = new Set<string>();

      // Account for the initial status before any changelog entry.
      // Jira doesn't record the creation-to-first-transition as a changelog item,
      // so the ticket's initial status (e.g. "Distribution") is missed unless we
      // measure from issue.created to the first transition's occurredAt.
      if (issue.transitions.length > 0) {
        const firstTransition = issue.transitions[0];
        const initialStatus = firstTransition.fromStatus;
        if (initialStatus) {
          const hours = calculateBusinessHours(issue.created, firstTransition.occurredAt, {
            regions: context.holidays.regions,
            workStartHour: context.holidays.workStartHour,
            workEndHour: context.holidays.workEndHour,
            workDaysPerWeek: context.holidays.workDaysPerWeek,
          });
          if (!statusHours[initialStatus]) {
            statusHours[initialStatus] = { total: 0, count: 0, issueCount: 0 };
          }
          if (!issuesPerStatus[initialStatus]) {
            issuesPerStatus[initialStatus] = new Set();
          }
          statusHours[initialStatus].total += hours;
          statusHours[initialStatus].count++;
          statusHours[initialStatus].issueCount++;
          issuesPerStatus[initialStatus].add(issue.key);
          seen.add(initialStatus);
        }
      }

      for (let i = 0; i < issue.transitions.length; i++) {
        const transition = issue.transitions[i];
        const status = transition.toStatus;
        
        // Include all transitions to track total time in status accurately
        const nextTransition = issue.transitions[i + 1];
        const nextTime = nextTransition 
          ? nextTransition.occurredAt 
          : (issue.resolved || new Date());

        const hours = calculateBusinessHours(transition.occurredAt, nextTime, {
          regions: context.holidays.regions,
          workStartHour: context.holidays.workStartHour,
          workEndHour: context.holidays.workEndHour,
          workDaysPerWeek: context.holidays.workDaysPerWeek,
        });

        if (!statusHours[status]) {
          statusHours[status] = { total: 0, count: 0, issueCount: 0 };
        }
        if (!issuesPerStatus[status]) {
          issuesPerStatus[status] = new Set();
        }

        statusHours[status].total += hours;
        statusHours[status].count++;
        if (!seen.has(status)) {
          statusHours[status].issueCount++;
          issuesPerStatus[status].add(issue.key);
        }
        seen.add(status);
      }
    }

    // Filter out transient statuses (average under 1 minute)
    const MIN_STATUS_HOURS = 1 / 60; // 1 minute in hours

    return Object.entries(statusHours)
      .filter(([, data]) => data.total / Math.max(data.count, 1) >= MIN_STATUS_HOURS)
      .map(([status, data]) => ({
        name: `Time in ${status}`,
        value: Math.round((data.total / Math.max(data.count, 1)) * 100) / 100,
        unit: 'hours',
        dimensions: { status },
        ticketKeys: Array.from(issuesPerStatus[status] || []),
        details: [
          { label: 'Total Occurrences', value: data.count },
          { label: 'Unique Issues', value: data.issueCount },
          { label: 'Total Hours', value: Math.round(data.total * 100) / 100 },
          { label: 'Avg Hours per Occurrence', value: Math.round((data.total / Math.max(data.count, 1)) * 100) / 100 },
        ],
      }));
  },
};

export default timeInStatusPlugin;
