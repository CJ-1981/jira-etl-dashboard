/**
 * Open Tickets by Priority Plugin
 * Number of non-resolved tickets for each priority level, broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

// @MX:NOTE: Age categories for open tickets analysis
// @MX:REASON: Provides insight into ticket freshness and backlog age distribution
type AgeCategory = 'this_week' | 'last_week' | 'existing';

function getAgeCategory(createdDate: Date | string, referenceDate: Date | string): AgeCategory {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const createdDateObj = new Date(createdDate);
  const referenceDateObj = new Date(referenceDate);
  const ageMs = referenceDateObj.getTime() - createdDateObj.getTime();
  const weeksOld = Math.floor(ageMs / msPerWeek);

  if (weeksOld === 0) return 'this_week';
  if (weeksOld === 1) return 'last_week';
  return 'existing';
}

// Priority order for ascending sort (P0 → P3, Highest → Lowest)
const priorityOrder: Record<string, number> = {
  'Highest': 0,
  'High': 1,
  'Medium': 2,
  'Low': 3,
  'Lowest': 4,
  'P0': 0,
  'P0-Highest': 0,
  'P1': 1,
  'P1-High': 1,
  'P2': 2,
  'P2-Medium': 2,
  'P3': 3,
  'P3-Low': 3,
  'P4': 4,
  'P4-Lowest': 4,
  // Handle case variations and Jira-specific formats
  'p0': 0,
  'p0-highest': 0,
  'p1': 1,
  'p1-high': 1,
  'p2': 2,
  'p2-medium': 2,
  'p3': 3,
  'p3-low': 3,
  'p4': 4,
  'p4-lowest': 4,
  'Unassigned': 999,
};

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

    // Group tickets by priority and age category
    const priorityAgeGroups: Record<string, Record<AgeCategory, Set<string>>> = {};

    for (const issue of openIssues) {
      const priority = issue.priority || 'Unassigned';
      if (!priorityAgeGroups[priority]) {
        priorityAgeGroups[priority] = {
          this_week: new Set(),
          last_week: new Set(),
          existing: new Set(),
        };
      }

      const ageCategory = getAgeCategory(issue.created, referenceDate);
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
            { label: 'Age', value: 0, unit: '2+ weeks old' },
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
            { label: 'Age', value: 0, unit: '1 week old' },
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
            { label: 'Age', value: 0, unit: 'This week' },
          ],
        });
      }
    }

    // Sort results by priority (ascending P0→P3), then by age category (existing → last_week → this_week)
    const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
    const sortedResults = results.sort((a, b) => {
      const priorityA = a.dimensions?.priority || '';
      const priorityB = b.dimensions?.priority || '';
      const orderA = priorityOrder[priorityA] ?? 999;
      const orderB = priorityOrder[priorityB] ?? 999;
      const ageA = ageOrder[a.dimensions?.ageCategory as AgeCategory] ?? 999;
      const ageB = ageOrder[b.dimensions?.ageCategory as AgeCategory] ?? 999;

      if (orderA !== orderB) return orderA - orderB; // Ascending priority (P0 → P3)
      return ageA - ageB; // Existing (0) → Last Week (1) → This Week (2)
    });

    // Return sorted results (no reversal needed - Recharts handles order correctly)
    return sortedResults;
  },
};

export default openTicketsByPriorityPlugin;
