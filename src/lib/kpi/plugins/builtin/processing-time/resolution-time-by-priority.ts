/**
 * Resolution Time by Priority Plugin
 * Average business hours from creation to resolution, sliced by priority.
 * Excludes weekends and German holidays (shared business-hours math).
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { getPriorityOrder } from '../../../engine-utils';

const resolutionTimeByPriorityPlugin: KpiPlugin<KpiResult[]> = {
  id: 'resolution_time_by_priority',
  name: 'Resolution Time by Priority',
  description:
    'Average business hours from creation to resolution for each priority level ' +
    '(weekends and German holidays excluded). Answers whether high-priority tickets are actually resolved faster.',
  category: 'builtin',
  domain: 'processing-time',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'hours',

  calculate(context: KpiContext): KpiResult[] {
    const byPriority: Record<string, { totalHours: number; count: number; ticketKeys: string[] }> = {};

    for (const issue of context.issues) {
      if (!issue.resolved) continue;
      const priority = issue.priority || 'Unassigned';
      if (!byPriority[priority]) {
        byPriority[priority] = { totalHours: 0, count: 0, ticketKeys: [] };
      }
      const hours = calculateBusinessHours(issue.created, issue.resolved, {
        regions: context.holidays.regions,
        workStartHour: context.holidays.workStartHour,
        workEndHour: context.holidays.workEndHour,
        workDaysPerWeek: context.holidays.workDaysPerWeek,
      });
      byPriority[priority].totalHours += hours;
      byPriority[priority].count++;
      byPriority[priority].ticketKeys.push(issue.key);
    }

    return Object.entries(byPriority)
      .sort(([a], [b]) => getPriorityOrder(a) - getPriorityOrder(b))
      .map(([priority, data]) => {
        const avg = data.totalHours / data.count;
        return {
          name: `Resolution Time: ${priority}`,
          value: Math.round(avg * 100) / 100,
          unit: 'hours',
          dimensions: { priority },
          ticketKeys: data.ticketKeys,
          details: [
            { label: 'Resolved Tickets', value: data.count, unit: 'tickets' },
            { label: 'Total Business Hours', value: Math.round(data.totalHours * 100) / 100, unit: 'hours' },
          ],
        };
      });
  },
};

export default resolutionTimeByPriorityPlugin;
