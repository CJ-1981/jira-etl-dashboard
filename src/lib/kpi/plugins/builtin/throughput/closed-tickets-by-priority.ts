/**
 * Closed Tickets by Priority Plugin
 * Number of resolved tickets for each priority level, broken down by when they were closed
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

// @MX:NOTE: Age categories for closed tickets analysis
// @MX:REASON: Provides insight into ticket resolution freshness and throughput distribution
type AgeCategory = 'this_week' | 'last_week' | 'existing';

function getAgeCategory(closedDate: Date | string, referenceDate: Date | string): AgeCategory {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const closedDateObj = new Date(closedDate);
  const referenceDateObj = new Date(referenceDate);
  const ageMs = referenceDateObj.getTime() - closedDateObj.getTime();
  const weeksOld = Math.floor(Math.max(0, ageMs) / msPerWeek);

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
  // P-priority formats (uppercase)
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
  // p-priority formats (lowercase)
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
  // Generic priority levels
  'unassigned': 999,
  'Unassigned': 999,
  'Unknown': 998,
  'unknown': 998,
};

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
    const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };

    // Helper function to get priority order value
    const getPriorityOrder = (priority: string): number => {
      if (!priority) return 999;

      // Try exact match first
      if (priorityOrder[priority] !== undefined) return priorityOrder[priority];

      // Try normalized lowercase version
      const normalized = priority.toLowerCase().trim();
      if (priorityOrder[normalized] !== undefined) return priorityOrder[normalized];

      // Try extracting P-number from various formats
      const pMatch = priority.match(/p(\d+)/i);
      if (pMatch) {
        return parseInt(pMatch[1], 10); // P0=0, P1=1, P2=2, etc.
      }

      // Try textual priority levels
      const textualPriority = normalized.toLowerCase();
      if (textualPriority.includes('highest') || textualPriority === 'p0') return 0;
      if (textualPriority.includes('high') && !textualPriority.includes('highest')) return 1;
      if (textualPriority.includes('medium')) return 2;
      if (textualPriority.includes('low')) {
        // Distinguish between Low and Lowest
        if (textualPriority.includes('lowest')) return 4;
        return 3;
      }

      // Fallback: try alphabetical sort for unknown formats
      return 999;
    };

    const sortedResults = results.sort((a, b) => {
      const priorityA = a.dimensions?.priority || '';
      const priorityB = b.dimensions?.priority || '';

      const orderA = getPriorityOrder(priorityA);
      const orderB = getPriorityOrder(priorityB);

      const ageA = ageOrder[a.dimensions?.ageCategory as AgeCategory] ?? 999;
      const ageB = ageOrder[b.dimensions?.ageCategory as AgeCategory] ?? 999;

      if (orderA !== orderB) return orderA - orderB; // Ascending priority (P0 → P3)
      return ageA - ageB; // Existing (0) → Last Week (1) → This Week (2)
    });

    return sortedResults;
  },
};

export default closedTicketsByPriorityPlugin;
