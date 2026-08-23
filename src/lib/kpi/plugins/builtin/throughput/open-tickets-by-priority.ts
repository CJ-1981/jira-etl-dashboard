/**
 * Open Tickets by Priority Plugin
 * Number of non-resolved tickets for each priority level, broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import { calculateAgeBreakdown, OPEN_TICKET_AGE_LABELS } from '../../../utils/age-breakdown';

const openTicketsByPriorityPlugin: KpiPlugin = {
  id: 'open_tickets_by_priority',
  name: 'Open Tickets by Priority',
  description: 'Number of non-resolved tickets for each priority level, broken down by ticket age.',
  category: 'builtin',
  domain: 'throughput',
  version: '2.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const referenceDate = context.period?.end ?? new Date(); // Use period end date for consistent age calculation
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    // Shared group-by-priority x age-category pipeline (sorted P0→P3, then by age)
    return calculateAgeBreakdown(
      openIssues,
      referenceDate,
      (i) => i.created,
      (i) => i.priority,
      {
        dimensionKey: 'priority',
        dimensionLabel: 'Priority',
        ageLabels: OPEN_TICKET_AGE_LABELS,
        sortBy: 'priority',
      },
    );
  },
};

export default openTicketsByPriorityPlugin;
