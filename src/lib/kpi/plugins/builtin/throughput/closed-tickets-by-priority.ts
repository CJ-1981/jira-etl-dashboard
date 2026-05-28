/**
 * Closed Tickets by Priority Plugin
 * Number of resolved tickets for each priority level, broken down by when they were closed
 */

import type { KpiPlugin, KpiContext, KpiResult, AgeCategory } from '../../../types';
import { isIssueDone, getAgeCategory, AGE_ORDER, getPriorityOrder } from '../../../engine-utils';

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

    // Group tickets by priority and age category
    const priorityAgeGroups: Record<string, Record<AgeCategory, Set<string>>> = {};

    for (const issue of closedIssues) {
      const priority = issue.priority || 'Unassigned';
      if (!priorityAgeGroups[priority]) {
        priorityAgeGroups[priority] = {
          this_week: new Set(),
          last_week: new Set(),
          existing: new Set(),
        };
      }

      const closedDate = issue.resolved || issue.updated;
      const ageCategory = getAgeCategory(closedDate, referenceDate);
      priorityAgeGroups[priority][ageCategory].add(issue.key);
    }

    // Convert to result format with age breakdown
    const results: KpiResult[] = [];

    for (const [priority, ageGroups] of Object.entries(priorityAgeGroups)) {
      const existingCount = ageGroups.existing.size;
      const lastWeekCount = ageGroups.last_week.size;
      const thisWeekCount = ageGroups.this_week.size;

      // Create separate results for each age category to enable stacked/grouped visualization
      if (existingCount > 0) {
        results.push({
          name: `Priority: ${priority} (Existing)`,
          value: existingCount,
          unit: 'tickets',
          dimensions: { priority, ageCategory: 'existing' },
          ticketKeys: Array.from(ageGroups.existing),
          details: [
            { label: 'Priority', value: 0, unit: priority },
            { label: 'Age', value: 0, unit: 'Closed 2+ weeks ago' },
          ],
        });
      }

      if (lastWeekCount > 0) {
        results.push({
          name: `Priority: ${priority} (Last Week)`,
          value: lastWeekCount,
          unit: 'tickets',
          dimensions: { priority, ageCategory: 'last_week' },
          ticketKeys: Array.from(ageGroups.last_week),
          details: [
            { label: 'Priority', value: 0, unit: priority },
            { label: 'Age', value: 0, unit: 'Closed 1 week ago' },
          ],
        });
      }

      if (thisWeekCount > 0) {
        results.push({
          name: `Priority: ${priority} (This Week)`,
          value: thisWeekCount,
          unit: 'tickets',
          dimensions: { priority, ageCategory: 'this_week' },
          ticketKeys: Array.from(ageGroups.this_week),
          details: [
            { label: 'Priority', value: 0, unit: priority },
            { label: 'Age', value: 0, unit: 'Closed this week' },
          ],
        });
      }
    }

    // Sort results by priority (ascending P0→P3), then by age category (existing → last_week → this_week)
    const sortedResults = results.sort((a, b) => {
      const priorityA = a.dimensions?.priority || '';
      const priorityB = b.dimensions?.priority || '';

      const orderA = getPriorityOrder(priorityA);
      const orderB = getPriorityOrder(priorityB);

      const ageA = AGE_ORDER[a.dimensions?.ageCategory as AgeCategory] ?? 999;
      const ageB = AGE_ORDER[b.dimensions?.ageCategory as AgeCategory] ?? 999;

      if (orderA !== orderB) return orderA - orderB; // Ascending priority (P0 → P3)
      return ageA - ageB; // Existing (0) → Last Week (1) → This Week (2)
    });

    return sortedResults;
  },
};

export default closedTicketsByPriorityPlugin;
