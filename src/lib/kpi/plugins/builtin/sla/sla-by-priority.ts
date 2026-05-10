/**
 * SLA Compliance by Priority Plugin
 * SLA compliance rate for each priority level
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const slaByPriorityPlugin: KpiPlugin = {
  id: 'sla_by_priority',
  name: 'SLA Compliance by Priority',
  description: 'SLA compliance rate for each priority level.',
  category: 'builtin',
  domain: 'sla',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'pie',
  unit: '%',

  calculate(context: KpiContext): KpiResult[] {
    const slaTargets: Record<string, number> = {
      Highest: 8,
      High: 24,
      Medium: 40,
      Low: 80,
      Lowest: 120,
    };

    const resolvedByPriority: Record<
      string,
      { total: number; withinSla: number; ticketKeys: Set<string> }
    > = {};

    for (const issue of context.issues) {
      if (!issue.resolved) continue;
      const priority = issue.priority || 'Unassigned';
      if (!resolvedByPriority[priority]) {
        resolvedByPriority[priority] = { total: 0, withinSla: 0, ticketKeys: new Set() };
      }
      resolvedByPriority[priority].total++;
      resolvedByPriority[priority].ticketKeys.add(issue.key);

      const hours = calculateBusinessHours(issue.created, issue.resolved, context.holidays);
      const target = slaTargets[priority] || 40;
      if (hours <= target) {
        resolvedByPriority[priority].withinSla++;
      }
    }

    return Object.entries(resolvedByPriority)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([priority, data]) => ({
        name: `SLA: ${priority}`,
        value: Math.round((data.withinSla / data.total) * 10000) / 100,
        unit: '%',
        dimensions: { priority },
        ticketKeys: Array.from(data.ticketKeys),
        details: [
          { label: 'Target', value: slaTargets[priority] || 40, unit: 'hours' },
          { label: 'Within SLA', value: data.withinSla },
          { label: 'Total', value: data.total },
        ],
      }));
  },
};

export default slaByPriorityPlugin;
