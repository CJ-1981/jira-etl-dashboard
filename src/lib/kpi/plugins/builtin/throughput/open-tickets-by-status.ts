/**
 * Open Tickets by Status Plugin
 * Number of non-resolved tickets for each status value
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const openTicketsByStatusPlugin: KpiPlugin = {
  id: 'open_tickets_by_status',
  name: 'Open Tickets by Status',
  description: 'Number of non-resolved tickets for each status value.',
  category: 'builtin',
  domain: 'throughput',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const counts: Record<string, number> = {};
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    for (const issue of openIssues) {
      const status = issue.status || 'Unassigned';
      counts[status] = (counts[status] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([status, count]) => {
        const issuesForStatus = openIssues.filter((i) => (i.status || 'Unassigned') === status);
        return {
          name: `Status: ${status}`,
          value: count,
          unit: 'tickets',
          dimensions: { status },
          ticketKeys: issuesForStatus.map((i) => i.key),
          details: [
            { label: 'Status', value: 0, unit: status },
          ],
        };
      });
  },
};

export default openTicketsByStatusPlugin;
