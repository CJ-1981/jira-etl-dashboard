/**
 * Open Tickets by Assignee Plugin
 * Number of non-resolved tickets currently assigned to each user
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const openTicketsByAssigneePlugin: KpiPlugin = {
  id: 'open_tickets_by_assignee',
  name: 'Open Tickets by Assignee',
  description: 'Number of non-resolved tickets currently assigned to each user.',
  category: 'builtin',
  domain: 'assignee',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const counts: Record<string, number> = {};
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    for (const issue of openIssues) {
      const assignee = issue.assignee || 'Unassigned';
      counts[assignee] = (counts[assignee] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([assignee, count]) => {
        const issuesForAssignee = openIssues.filter((i) => (i.assignee || 'Unassigned') === assignee);
        return {
          name: `Open: ${assignee}`,
          value: count,
          unit: 'tickets',
          dimensions: { assignee },
          ticketKeys: issuesForAssignee.map((i) => i.key),
          details: [
            { label: 'Assignee', value: 0, unit: assignee }, // Value 0 but label shows name
          ],
        };
      });
  },
};

export default openTicketsByAssigneePlugin;
