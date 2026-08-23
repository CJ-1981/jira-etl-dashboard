/**
 * Closed Tickets by Priority Plugin
 * Number of resolved tickets for each priority level, broken down by when they were closed
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import { calculateAgeBreakdown, CLOSED_TICKET_AGE_LABELS } from '../../../utils/age-breakdown';

const closedTicketsByPriorityPlugin: KpiPlugin = {
  id: 'closed_tickets_by_priority',
  name: 'Closed Tickets by Priority',
  description: 'Number of resolved tickets for each priority level, broken down by when they were closed.',
  category: 'builtin',
  domain: 'throughput',
  version: '2.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const referenceDate = context.period?.end ?? new Date(); // Use period end date for consistent age calculation
    const closedIssues = context.issues.filter((i) => isIssueDone(i));

    // Shared group-by-priority x age-category pipeline; age is measured from
    // the close date (resolved, falling back to updated) instead of created
    return calculateAgeBreakdown(
      closedIssues,
      referenceDate,
      (i) => i.resolved || i.updated,
      (i) => i.priority,
      {
        dimensionKey: 'priority',
        dimensionLabel: 'Priority',
        ageLabels: CLOSED_TICKET_AGE_LABELS,
        sortBy: 'priority',
      },
    );
  },
};

export default closedTicketsByPriorityPlugin;
