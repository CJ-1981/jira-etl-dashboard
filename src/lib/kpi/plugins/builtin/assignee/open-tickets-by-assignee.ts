/**
 * Open Tickets by Assignee Plugin
 * Number of non-resolved tickets currently assigned to each user, broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import { calculateAgeBreakdown, OPEN_TICKET_AGE_LABELS } from '../../../utils/age-breakdown';

const openTicketsByAssigneePlugin: KpiPlugin = {
  id: 'open_tickets_by_assignee',
  name: 'Open Tickets by Assignee',
  description: 'Number of non-resolved tickets currently assigned to each user, broken down by ticket age.',
  category: 'builtin',
  domain: 'assignee',
  version: '2.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const referenceDate = context.period?.end ?? new Date(); // Use period end date for consistent age calculation
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    // Shared group-by-assignee x age-category pipeline (sorted by total count desc, then by age)
    return calculateAgeBreakdown(
      openIssues,
      referenceDate,
      (i) => i.created,
      (i) => i.assignee,
      {
        dimensionKey: 'assignee',
        dimensionLabel: 'Assignee',
        ageLabels: OPEN_TICKET_AGE_LABELS,
        sortBy: 'total-desc',
      },
    );
  },
};

export default openTicketsByAssigneePlugin;
