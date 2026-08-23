/**
 * Open Tickets by Status Plugin
 * Number of non-resolved tickets for each status value, broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import { calculateAgeBreakdown, OPEN_TICKET_AGE_LABELS } from '../../../utils/age-breakdown';

const openTicketsByStatusPlugin: KpiPlugin = {
  id: 'open_tickets_by_status',
  name: 'Open Tickets by Status',
  description: 'Number of non-resolved tickets for each status value, broken down by ticket age.',
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

    // Shared group-by-status x age-category pipeline (sorted by total count desc, then by age)
    return calculateAgeBreakdown(
      openIssues,
      referenceDate,
      (i) => i.created,
      (i) => i.status,
      {
        dimensionKey: 'status',
        dimensionLabel: 'Status',
        ageLabels: OPEN_TICKET_AGE_LABELS,
        sortBy: 'total-desc',
      },
    );
  },
};

export default openTicketsByStatusPlugin;
