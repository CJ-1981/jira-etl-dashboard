/**
 * Open Tickets by Issue Owner Team Plugin
 * Number of non-resolved tickets for each Issue Owner Team (LTIC)
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const openTicketsByIssueOwnerTeamPlugin: KpiPlugin = {
  id: 'open_tickets_by_issue_owner_team',
  name: 'Open Tickets by Issue Owner Team',
  description: 'Number of non-resolved tickets for each Issue Owner Team (LTIC).',
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
      const team = issue.issueOwnerTeam || 'Unassigned';
      counts[team] = (counts[team] || 0) + 1;
    }

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1]) // Sort by count descending
      .map(([team, count]) => {
        const issuesForTeam = openIssues.filter((i) => (i.issueOwnerTeam || 'Unassigned') === team);
        return {
          name: `Team: ${team}`,
          value: count,
          unit: 'tickets',
          dimensions: { team },
          ticketKeys: issuesForTeam.map((i) => i.key),
          details: [
            { label: 'Team', value: 0, unit: team },
          ],
        };
      });
  },
};

export default openTicketsByIssueOwnerTeamPlugin;
