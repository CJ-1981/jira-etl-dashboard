/**
 * Average Reassignments Plugin
 * Average number of times tickets are reassigned (assignee changes)
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const reassignmentPlugin: KpiPlugin = {
  id: 'reassignment_count',
  name: 'Avg. Reassignments',
  description: 'Average number of times tickets are reassigned (assignee changes).',
  category: 'builtin',
  domain: 'quality',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'reassignments',

  calculate(context: KpiContext): KpiResult[] {
    let totalReassignments = 0;
    let issuesWithReassignments = 0;
    const ticketKeys: string[] = [];

    for (const issue of context.issues) {
      const rawIssue = issue as unknown as any;
      if (!rawIssue.changelog?.histories) continue;

      let reassignments = 0;
      for (const history of rawIssue.changelog.histories) {
        for (const item of history.items) {
          if (item.field === 'assignee' && item.from && item.to) {
            reassignments++;
          }
        }
      }
      if (reassignments > 0) {
        issuesWithReassignments++;
        ticketKeys.push(issue.key);
      }
      totalReassignments += reassignments;
    }

    return [
      {
        name: 'Avg. Reassignments',
        value:
          context.issues.length > 0 ? Math.round((totalReassignments / context.issues.length) * 100) / 100 : 0,
        unit: 'reassignments',
        ticketKeys,
        details: [
          { label: 'Total Reassignments', value: totalReassignments },
          { label: 'Issues with Reassignments', value: issuesWithReassignments },
        ],
      },
    ];
  },
};

export default reassignmentPlugin;
