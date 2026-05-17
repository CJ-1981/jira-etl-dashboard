/**
 * Open Tickets in Kanban View Plugin
 * Open tickets organized by Assignee, Status, and Age Category, supporting Kanban board visualization and drill-down
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

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

const openTicketsKanbanPlugin: KpiPlugin = {
  id: 'open_tickets_kanban',
  name: 'Open Tickets in Kanban View',
  description: 'Open tickets organized by Assignee, Status, and Age Category, supporting Kanban board visualization and drill-down.',
  category: 'builtin',
  domain: 'throughput',
  version: '1.1.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const referenceDate = context.period?.end ?? new Date();
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    // Group tickets by status, then assignee, then age category
    const groups: Record<string, Record<string, Record<AgeCategory, Set<string>>>> = {};

    for (const issue of openIssues) {
      const status = issue.status || 'Unknown';
      const assignee = issue.assignee || 'Unassigned';
      const ageCat = getAgeCategory(issue.created, referenceDate);

      if (!groups[status]) {
        groups[status] = {};
      }
      if (!groups[status][assignee]) {
        groups[status][assignee] = {
          this_week: new Set(),
          last_week: new Set(),
          existing: new Set(),
        };
      }
      groups[status][assignee][ageCat].add(issue.key);
    }

    const results: KpiResult[] = [];
    const ageLabels: Record<AgeCategory, string> = {
      this_week: 'This week',
      last_week: '1 week',
      existing: '2+ weeks',
    };

    for (const [status, assignees] of Object.entries(groups)) {
      for (const [assignee, ageGroups] of Object.entries(assignees)) {
        for (const [ageCat, keySet] of Object.entries(ageGroups)) {
          if (keySet.size > 0) {
            const category = ageCat as AgeCategory;
            results.push({
              name: `${assignee} (${status}) [${ageLabels[category]}]`,
              value: keySet.size,
              unit: 'tickets',
              dimensions: {
                kanban: `${assignee} — ${status} (${ageLabels[category]})`,
                status,
                assignee,
                ageCategory: category,
              },
              ticketKeys: Array.from(keySet),
              details: [
                { label: 'Assignee', value: 0, unit: assignee },
                { label: 'Status', value: 0, unit: status },
                { label: 'Age', value: 0, unit: ageLabels[category] },
              ],
            });
          }
        }
      }
    }

    const ageOrder: Record<AgeCategory, number> = { existing: 0, last_week: 1, this_week: 2 };

    // Sort results by status, then assignee, then age
    return results.sort((a, b) => {
      const statusA = a.dimensions?.status || '';
      const statusB = b.dimensions?.status || '';
      if (statusA !== statusB) return statusA.localeCompare(statusB);

      const assigneeA = a.dimensions?.assignee || '';
      const assigneeB = b.dimensions?.assignee || '';
      if (assigneeA !== assigneeB) return assigneeA.localeCompare(assigneeB);

      const ageA = ageOrder[(a.dimensions?.ageCategory as AgeCategory) ?? 'existing'] ?? 999;
      const ageB = ageOrder[(b.dimensions?.ageCategory as AgeCategory) ?? 'existing'] ?? 999;
      return ageA - ageB;
    });
  },
};

export default openTicketsKanbanPlugin;
