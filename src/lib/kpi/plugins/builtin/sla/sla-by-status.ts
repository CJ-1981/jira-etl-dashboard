/**
 * SLA Compliance by Status Plugin
 * SLA compliance rate for each workflow status
 * Supports comment-based clock reset for SLA calculation
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const slaByStatusPlugin: KpiPlugin = {
  id: 'sla_by_status',
  name: 'SLA Compliance by Status',
  description: 'SLA compliance rate for each workflow status, with comment-based clock reset.',
  category: 'builtin',
  domain: 'sla',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'pie',
  unit: '%',

  calculate(context: KpiContext): KpiResult[] {
    const targets = context.slaTargets || {};
    const targetEntries = Object.entries(targets).filter(([, h]) => h > 0);
    if (targetEntries.length === 0) return [];

    // Collect available statuses from transitions
    const availableStatuses = new Set<string>();
    for (const issue of context.issues) {
      for (const t of issue.transitions) {
        if (t.toStatus) availableStatuses.add(t.toStatus);
        if (t.fromStatus) availableStatuses.add(t.fromStatus);
      }
    }

    const results: KpiResult[] = [];

    for (const [configuredStatus, targetHours] of targetEntries) {
      let totalOccurrences = 0;
      let withinSla = 0;
      const ticketKeys = new Set<string>();

      // Try exact match first, then case-insensitive match
      const matchingStatuses = Array.from(availableStatuses).filter(
        (s) => s === configuredStatus || s.toLowerCase() === configuredStatus.toLowerCase()
      );

      if (matchingStatuses.length === 0) {
        continue;
      }

      // Use the first matching status (prefer exact match)
      const status = matchingStatuses.find((s) => s === configuredStatus) || matchingStatuses[0];

      for (const issue of context.issues) {
        let issueMatchedStatus = false;

        // Find periods where the ticket was in this status
        for (let i = 0; i < issue.transitions.length; i++) {
          const t = issue.transitions[i];
          if (t.toStatus !== status) continue;

          issueMatchedStatus = true;
          const statusEntry = t.occurredAt;
          const statusExit = issue.transitions[i + 1]
            ? issue.transitions[i + 1].occurredAt
            : issue.resolved || new Date();

          totalOccurrences++;

          // Find relevant comments during this status period (assignee only or anyone based on config)
          const relevantComments = issue.comments.filter((c) => {
            const authorMatch = context.useAnyoneCommentsForSla || c.author === issue.assignee;
            return authorMatch && c.created >= statusEntry && c.created <= statusExit;
          });

          // SLA clock resets to the last relevant comment
          const slaStart = relevantComments.length > 0 ? relevantComments[relevantComments.length - 1].created : statusEntry;

          const hours = calculateBusinessHours(slaStart, statusExit, context.holidays);
          if (hours <= targetHours) {
            withinSla++;
          }
          ticketKeys.add(issue.key);
        }

        // Also check initial status (before first transition)
        if (issue.transitions.length > 0) {
          const firstTransition = issue.transitions[0];
          if (firstTransition.fromStatus === status) {
            issueMatchedStatus = true;
            const statusEntry = issue.created;
            const statusExit = firstTransition.occurredAt;

            totalOccurrences++;

            // Find relevant comments during this status period (assignee only or anyone based on config)
            const relevantComments = issue.comments.filter((c) => {
              const authorMatch = context.useAnyoneCommentsForSla || c.author === issue.assignee;
              return authorMatch && c.created >= statusEntry && c.created <= statusExit;
            });

            // SLA clock resets to the last relevant comment
            const slaStart = relevantComments.length > 0 ? relevantComments[relevantComments.length - 1].created : statusEntry;

            const hours = calculateBusinessHours(slaStart, statusExit, context.holidays);
            if (hours <= targetHours) {
              withinSla++;
            }
            ticketKeys.add(issue.key);
          }
        }
      }

      if (totalOccurrences > 0) {
        results.push({
          name: `SLA: ${status}`,
          value: Math.round((withinSla / totalOccurrences) * 10000) / 100,
          unit: '%',
          dimensions: { status },
          ticketKeys: Array.from(ticketKeys),
          details: [
            { label: 'Target', value: targetHours, unit: 'hours' },
            { label: 'Within SLA', value: withinSla },
            { label: 'Total Occurrences', value: totalOccurrences },
          ],
        });
      }
    }

    return results;
  },
};

export default slaByStatusPlugin;
