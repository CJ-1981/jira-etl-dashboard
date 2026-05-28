/**
 * Average Working Days Plugin
 * Calculates average working days from creation to resolution
 * Excludes weekends and German holidays
 */

import { calculateWorkingDays } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const avgWorkingDaysPlugin: KpiPlugin = {
  id: 'avg_working_days',
  name: 'Avg. Working Days',
  description: 'Average working days from creation to resolution, excluding weekends and German holidays.',
  category: 'builtin',
  domain: 'processing-time',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'days',

  calculate(context: KpiContext): KpiResult[] {
    const resolvedIssues = context.issues.filter((i) => i.resolved);
    if (resolvedIssues.length === 0) {
      return [{ name: 'Avg. Working Days', value: 0, unit: 'days' }];
    }

    const totalDays = resolvedIssues.reduce((sum, issue) => {
      return sum + calculateWorkingDays(issue.created, issue.resolved!, context.holidays.regions);
    }, 0);

    const avg = totalDays / resolvedIssues.length;

    return [
      {
        name: 'Avg. Working Days',
        value: Math.round(avg * 100) / 100,
        unit: 'days',
        ticketKeys: resolvedIssues.map((i) => i.key),
        details: [
          { label: 'Resolved Tickets', value: resolvedIssues.length, unit: 'tickets' },
          { label: 'Total Working Days', value: Math.round(totalDays * 100) / 100, unit: 'days' },
        ],
      },
    ];
  },
};

export default avgWorkingDaysPlugin;
