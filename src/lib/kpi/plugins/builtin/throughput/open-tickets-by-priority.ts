/**
 * Open Tickets by Priority Plugin
 * Number of non-resolved tickets for each priority level
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const openTicketsByPriorityPlugin: KpiPlugin = {
  id: 'open_tickets_by_priority',
  name: 'Open Tickets by Priority',
  description: 'Number of non-resolved tickets for each priority level.',
  category: 'builtin',
  domain: 'throughput',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'pie',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const counts: Record<string, number> = {};
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    for (const issue of openIssues) {
      const priority = issue.priority || 'Unassigned';
      counts[priority] = (counts[priority] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([priority, count]) => {
        const issuesForPriority = openIssues.filter((i) => (i.priority || 'Unassigned') === priority);
        return {
          name: `Priority: ${priority}`,
          value: count,
          unit: 'tickets',
          dimensions: { priority },
          ticketKeys: issuesForPriority.map((i) => i.key),
          details: [
            { label: 'Priority', value: 0, unit: priority },
          ],
        };
      });
  },
};

export default openTicketsByPriorityPlugin;
