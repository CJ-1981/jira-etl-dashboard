/**
 * Open Tickets by Assignee Plugin
 * Number of non-resolved tickets currently assigned to each user, broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

// @MX:NOTE: Age categories for open tickets analysis
// @MX:REASON: Provides insight into ticket freshness and backlog age distribution
type AgeCategory = 'this_week' | 'last_week' | 'existing';

function getAgeCategory(createdDate: Date, referenceDate: Date): AgeCategory {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const ageMs = referenceDate.getTime() - createdDate.getTime();
  const weeksOld = Math.floor(ageMs / msPerWeek);

  if (weeksOld === 0) return 'this_week';
  if (weeksOld === 1) return 'last_week';
  return 'existing';
}

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
    const referenceDate = context.period.end || new Date(); // Use period end date for consistent age calculation
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    // Group tickets by assignee and age category
    const assigneeAgeGroups: Record<string, Record<AgeCategory, Set<string>>> = {};

    for (const issue of openIssues) {
      const assignee = issue.assignee || 'Unassigned';
      if (!assigneeAgeGroups[assignee]) {
        assigneeAgeGroups[assignee] = {
          this_week: new Set(),
          last_week: new Set(),
          existing: new Set(),
        };
      }

      const ageCategory = getAgeCategory(issue.created, referenceDate);
      assigneeAgeGroups[assignee][ageCategory].add(issue.key);
    }

    // Convert to result format with age breakdown
    const results: KpiResult[] = [];

    for (const [assignee, ageGroups] of Object.entries(assigneeAgeGroups)) {
      const existingCount = ageGroups.existing.size;
      const lastWeekCount = ageGroups.last_week.size;
      const thisWeekCount = ageGroups.this_week.size;

      // Create separate results for each age category to enable stacked/grouped visualization
      if (existingCount > 0) {
        results.push({
          name: `Assignee: ${assignee} (Existing)`,
          value: existingCount,
          unit: 'tickets',
          dimensions: { assignee, ageCategory: 'existing' },
          ticketKeys: Array.from(ageGroups.existing),
          details: [
            { label: 'Assignee', value: 0, unit: assignee },
            { label: 'Age', value: 0, unit: '2+ weeks old' },
          ],
        });
      }

      if (lastWeekCount > 0) {
        results.push({
          name: `Assignee: ${assignee} (Last Week)`,
          value: lastWeekCount,
          unit: 'tickets',
          dimensions: { assignee, ageCategory: 'last_week' },
          ticketKeys: Array.from(ageGroups.last_week),
          details: [
            { label: 'Assignee', value: 0, unit: assignee },
            { label: 'Age', value: 0, unit: '1 week old' },
          ],
        });
      }

      if (thisWeekCount > 0) {
        results.push({
          name: `Assignee: ${assignee} (This Week)`,
          value: thisWeekCount,
          unit: 'tickets',
          dimensions: { assignee, ageCategory: 'this_week' },
          ticketKeys: Array.from(ageGroups.this_week),
          details: [
            { label: 'Assignee', value: 0, unit: assignee },
            { label: 'Age', value: 0, unit: 'This week' },
          ],
        });
      }
    }

    // Sort results by assignee name, then by age category (existing → last_week → this_week)
    const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
    return results.sort((a, b) => {
      const assigneeA = a.dimensions?.assignee || '';
      const assigneeB = b.dimensions?.assignee || '';
      const ageA = ageOrder[a.dimensions?.ageCategory as AgeCategory] ?? 999;
      const ageB = ageOrder[b.dimensions?.ageCategory as AgeCategory] ?? 999;

      if (assigneeA !== assigneeB) return assigneeA.localeCompare(assigneeB);
      return ageA - ageB; // Existing (0) → Last Week (1) → This Week (2)
    });
  },
};

export default openTicketsByAssigneePlugin;
