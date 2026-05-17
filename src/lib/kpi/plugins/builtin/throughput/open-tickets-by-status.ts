/**
 * Open Tickets by Status Plugin
 * Number of non-resolved tickets for each status value, broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult, AgeCategory } from '../../../types';
import { isIssueDone, getAgeCategory, AGE_ORDER } from '../../../engine-utils';

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

    // Group tickets by status and age category
    const statusAgeGroups: Record<string, Record<AgeCategory, Set<string>>> = {};

    for (const issue of openIssues) {
      const status = issue.status || 'Unassigned';
      if (!statusAgeGroups[status]) {
        statusAgeGroups[status] = {
          this_week: new Set(),
          last_week: new Set(),
          existing: new Set(),
        };
      }

      const ageCategory = getAgeCategory(issue.created, referenceDate);
      statusAgeGroups[status][ageCategory].add(issue.key);
    }

    // Convert to result format with age breakdown
    const results: KpiResult[] = [];

    for (const [status, ageGroups] of Object.entries(statusAgeGroups)) {
      const existingCount = ageGroups.existing.size;
      const lastWeekCount = ageGroups.last_week.size;
      const thisWeekCount = ageGroups.this_week.size;

      // Create separate results for each age category to enable stacked/grouped visualization
      if (existingCount > 0) {
        results.push({
          name: `Status: ${status} (Existing)`,
          value: existingCount,
          unit: 'tickets',
          dimensions: { status, ageCategory: 'existing' },
          ticketKeys: Array.from(ageGroups.existing),
          details: [
            { label: 'Status', value: 0, unit: status },
            { label: 'Age', value: 0, unit: '2+ weeks old' },
          ],
        });
      }

      if (lastWeekCount > 0) {
        results.push({
          name: `Status: ${status} (Last Week)`,
          value: lastWeekCount,
          unit: 'tickets',
          dimensions: { status, ageCategory: 'last_week' },
          ticketKeys: Array.from(ageGroups.last_week),
          details: [
            { label: 'Status', value: 0, unit: status },
            { label: 'Age', value: 0, unit: '1 week old' },
          ],
        });
      }

      if (thisWeekCount > 0) {
        results.push({
          name: `Status: ${status} (This Week)`,
          value: thisWeekCount,
          unit: 'tickets',
          dimensions: { status, ageCategory: 'this_week' },
          ticketKeys: Array.from(ageGroups.this_week),
          details: [
            { label: 'Status', value: 0, unit: status },
            { label: 'Age', value: 0, unit: 'This week' },
          ],
        });
      }
    }

    // Sort results by total status count (descending), then by age category (existing → last_week → this_week)
    const statusTotals = Object.fromEntries(
      Object.entries(statusAgeGroups).map(([status, groups]) => [
        status,
        groups.existing.size + groups.last_week.size + groups.this_week.size
      ])
    );

    const sortedResults = results.sort((a, b) => {
      const statusA = a.dimensions?.status || '';
      const statusB = b.dimensions?.status || '';
      const totalA = statusTotals[statusA] || 0;
      const totalB = statusTotals[statusB] || 0;
      const ageA = AGE_ORDER[a.dimensions?.ageCategory as AgeCategory] ?? 999;
      const ageB = AGE_ORDER[b.dimensions?.ageCategory as AgeCategory] ?? 999;

      if (totalA !== totalB) return totalB - totalA; // Descending total count
      if (statusA !== statusB) return statusA.localeCompare(statusB);
      return ageA - ageB; // Existing (0) → Last Week (1) → This Week (2)
    });

    // Return sorted results (no reversal needed - Recharts handles order correctly)
    return sortedResults;
  },
};

export default openTicketsByStatusPlugin;
