/**
 * Open Tickets by Issue Owner Team Plugin
 * Number of non-resolved tickets for each Issue Owner Team (LTIC), broken down by ticket age
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

const openTicketsByIssueOwnerTeamPlugin: KpiPlugin = {
  id: 'open_tickets_by_issue_owner_team',
  name: 'Open Tickets by Issue Owner Team',
  description: 'Number of non-resolved tickets for each Issue Owner Team (LTIC), broken down by ticket age.',
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

    // Group tickets by team and age category
    const teamAgeGroups: Record<string, Record<AgeCategory, Set<string>>> = {};

    for (const issue of openIssues) {
      const team = issue.issueOwnerTeam || 'Unassigned';
      if (!teamAgeGroups[team]) {
        teamAgeGroups[team] = {
          this_week: new Set(),
          last_week: new Set(),
          existing: new Set(),
        };
      }

      const ageCategory = getAgeCategory(issue.created, referenceDate);
      teamAgeGroups[team][ageCategory].add(issue.key);
    }

    // Convert to result format with age breakdown
    const results: KpiResult[] = [];

    for (const [team, ageGroups] of Object.entries(teamAgeGroups)) {
      const existingCount = ageGroups.existing.size;
      const lastWeekCount = ageGroups.last_week.size;
      const thisWeekCount = ageGroups.this_week.size;

      // Create separate results for each age category to enable stacked/grouped visualization
      if (existingCount > 0) {
        results.push({
          name: `Team: ${team} (Existing)`,
          value: existingCount,
          unit: 'tickets',
          dimensions: { team, ageCategory: 'existing' },
          ticketKeys: Array.from(ageGroups.existing),
          details: [
            { label: 'Team', value: 0, unit: team },
            { label: 'Age', value: 0, unit: '2+ weeks old' },
          ],
        });
      }

      if (lastWeekCount > 0) {
        results.push({
          name: `Team: ${team} (Last Week)`,
          value: lastWeekCount,
          unit: 'tickets',
          dimensions: { team, ageCategory: 'last_week' },
          ticketKeys: Array.from(ageGroups.last_week),
          details: [
            { label: 'Team', value: 0, unit: team },
            { label: 'Age', value: 0, unit: '1 week old' },
          ],
        });
      }

      if (thisWeekCount > 0) {
        results.push({
          name: `Team: ${team} (This Week)`,
          value: thisWeekCount,
          unit: 'tickets',
          dimensions: { team, ageCategory: 'this_week' },
          ticketKeys: Array.from(ageGroups.this_week),
          details: [
            { label: 'Team', value: 0, unit: team },
            { label: 'Age', value: 0, unit: 'This week' },
          ],
        });
      }
    }

    // Sort results by team name, then by age category (existing → last_week → this_week)
    const ageOrder = { 'existing': 0, 'last_week': 1, 'this_week': 2 };
    return results.sort((a, b) => {
      const teamA = a.dimensions?.team || '';
      const teamB = b.dimensions?.team || '';
      const ageA = ageOrder[a.dimensions?.ageCategory as AgeCategory] ?? 999;
      const ageB = ageOrder[b.dimensions?.ageCategory as AgeCategory] ?? 999;

      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return ageA - ageB; // Existing (0) → Last Week (1) → This Week (2)
    });
  },
};

export default openTicketsByIssueOwnerTeamPlugin;
