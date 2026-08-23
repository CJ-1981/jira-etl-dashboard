/**
 * First-Time Resolution Rate Plugin
 * Percentage of resolved tickets resolved without any assignee change
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const firstTimeResolutionPlugin: KpiPlugin = {
  id: 'first_time_resolution_rate',
  name: 'First-Time Resolution Rate',
  description:
    'Percentage of resolved tickets that were resolved without any assignee change — resolved on the first assignment. Lower values indicate hand-off churn before resolution.',
  category: 'builtin',
  domain: 'quality',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: '%',

  calculate(context: KpiContext): KpiResult[] {
    let firstTime = 0;
    let reassigned = 0;
    const ticketKeys: string[] = [];

    for (const issue of context.issues) {
      if (!issue.resolved) continue;

      const rawIssue = issue as unknown as any;
      let hasAssigneeChange = false;
      if (rawIssue.changelog?.histories) {
        for (const history of rawIssue.changelog.histories) {
          for (const item of history.items) {
            if (item.field === 'assignee' && item.from && item.to) {
              hasAssigneeChange = true;
            }
          }
        }
      }

      if (hasAssigneeChange) {
        reassigned++;
      } else {
        firstTime++;
        ticketKeys.push(issue.key);
      }
    }

    const total = firstTime + reassigned;
    if (total === 0) {
      return [{ name: 'First-Time Resolution Rate', value: 0, unit: '%' }];
    }

    return [
      {
        name: 'First-Time Resolution Rate',
        value: Math.round((firstTime / total) * 10000) / 100,
        unit: '%',
        ticketKeys,
        details: [
          { label: 'First-Time Resolved', value: firstTime },
          { label: 'Reassigned Before Resolution', value: reassigned },
          { label: 'Total Resolved', value: total },
        ],
      },
    ];
  },
};

export default firstTimeResolutionPlugin;
