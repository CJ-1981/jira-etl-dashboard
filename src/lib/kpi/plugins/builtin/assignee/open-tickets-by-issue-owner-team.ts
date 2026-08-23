/**
 * Open Tickets by Issue Owner Team Plugin
 * Number of non-resolved tickets for each Issue Owner Team (LTIC), broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import { calculateAgeBreakdown, OPEN_TICKET_AGE_LABELS } from '../../../utils/age-breakdown';

const openTicketsByIssueOwnerTeamPlugin: KpiPlugin = {
  id: 'open_tickets_by_issue_owner_team',
  name: 'Open Tickets by Issue Owner Team',
  description: 'Number of non-resolved tickets for each Issue Owner Team (LTIC), broken down by ticket age.',
  category: 'builtin',
  domain: 'assignee',
  version: '2.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar', // Supports stacked bar with age breakdown
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const referenceDate = context.period?.end ?? new Date(); // Use period end date for consistent age calculation
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    // Shared group-by-team x age-category pipeline (sorted by total count desc, then by age)
    return calculateAgeBreakdown(
      openIssues,
      referenceDate,
      (i) => i.created,
      (i) => i.issueOwnerTeam,
      {
        dimensionKey: 'team',
        dimensionLabel: 'Team',
        ageLabels: OPEN_TICKET_AGE_LABELS,
        sortBy: 'total-desc',
      },
    );
  },
};

export default openTicketsByIssueOwnerTeamPlugin;
