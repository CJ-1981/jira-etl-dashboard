/**
 * Open Tickets by Issue Owner Team Plugin
 * Number of non-resolved tickets for each Issue Owner Team (LTIC), broken down by ticket age
 */

import type { KpiPlugin, KpiContext, KpiResult, AgeCategory } from '../../../types';
import { isIssueDone, getAgeCategory, AGE_ORDER } from '../../../engine-utils';

const openTicketsByIssueOwnerTeamPlugin: KpiPlugin = {
  id: 'open_tickets_by_issue_owner_team',
  name: 'Open Tickets by Issue Owner Team',
  description: 'Number of non-resolved tickets for each Issue Owner Team (LTIC), broken down by ticket age.',
  category: 'builtin',
  domain: 'assignee',
  version: '2.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar', // Supports stacked bar with age breakdown
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

    // Sort results by total team count (descending), then by age category (existing → last_week → this_week)
    const teamTotals = Object.fromEntries(
      Object.entries(teamAgeGroups).map(([team, groups]) => [
        team,
        groups.existing.size + groups.last_week.size + groups.this_week.size
      ])
    );

    const sortedResults = results.sort((a, b) => {
      const teamA = a.dimensions?.team || '';
      const teamB = b.dimensions?.team || '';
      const totalA = teamTotals[teamA] || 0;
      const totalB = teamTotals[teamB] || 0;
      const ageA = AGE_ORDER[a.dimensions?.ageCategory as AgeCategory] ?? 999;
      const ageB = AGE_ORDER[b.dimensions?.ageCategory as AgeCategory] ?? 999;

      if (totalA !== totalB) return totalB - totalA; // Descending total count
      if (teamA !== teamB) return teamA.localeCompare(teamB);
      return ageA - ageB; // Existing (0) → Last Week (1) → This Week (2)
    });

    // Return sorted results (no reversal needed - Recharts handles order correctly)
    return sortedResults;
  },
};

export default openTicketsByIssueOwnerTeamPlugin;
