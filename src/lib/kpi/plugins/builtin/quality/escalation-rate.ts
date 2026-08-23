/**
 * Escalation Rate Plugin
 * Percentage of tickets whose priority was raised at least once (e.g. P3 → P0).
 * Reads priority changes from the raw Jira changelog.
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { getPriorityOrder } from '../../../engine-utils';

const escalationRatePlugin: KpiPlugin<KpiResult[]> = {
  id: 'escalation_rate',
  name: 'Escalation Rate',
  description:
    'Percentage of tickets whose priority was raised at least once (e.g. P3 → P0). ' +
    'High values indicate triage misses or growing urgency. De-escalations are tracked in the details.',
  category: 'builtin',
  domain: 'quality',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: '%',

  calculate(context: KpiContext): KpiResult[] {
    let escalated = 0;
    let deescalated = 0;
    const ticketKeys: string[] = [];

    for (const issue of context.issues) {
      const rawIssue = issue as unknown as any;
      if (!rawIssue.changelog?.histories) continue;

      let raises = 0;
      let lowers = 0;
      for (const history of rawIssue.changelog.histories) {
        for (const item of history.items) {
          if (item.field === 'priority' && item.fromString && item.toString) {
            const from = getPriorityOrder(item.fromString);
            const to = getPriorityOrder(item.toString);
            // Lower order number = higher priority (P0 before P3)
            if (to < from) raises++;
            else if (to > from) lowers++;
          }
        }
      }
      if (raises > 0) {
        escalated++;
        ticketKeys.push(issue.key);
      }
      if (lowers > 0) deescalated++;
    }

    const total = context.issues.length;
    const rate = total > 0 ? Math.round((escalated / total) * 10000) / 100 : 0;

    return [
      {
        name: 'Escalation Rate',
        value: rate,
        unit: '%',
        ticketKeys,
        details: [
          { label: 'Escalated Tickets', value: escalated, unit: 'tickets' },
          { label: 'De-escalated Tickets', value: deescalated, unit: 'tickets' },
          { label: 'Total Tickets', value: total, unit: 'tickets' },
        ],
      },
    ];
  },
};

export default escalationRatePlugin;
