/**
 * Average Processing Hours Plugin
 * Calculates average business hours from creation to resolution
 * Excludes weekends and German holidays
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const avgProcessingHoursPlugin: KpiPlugin = {
  id: 'avg_processing_hours',
  name: 'Avg. Processing Hours',
  description: 'Average business hours from creation to resolution, excluding weekends and German holidays.',
  category: 'builtin',
  domain: 'processing-time',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'hours',

  calculate(context: KpiContext): KpiResult[] {
    const resolvedIssues = context.issues.filter((i) => i.resolved);
    if (resolvedIssues.length === 0) {
      return [{ name: 'Avg. Processing Hours', value: 0, unit: 'hours' }];
    }

    const totalHours = resolvedIssues.reduce((sum, issue) => {
      return sum + calculateBusinessHours(issue.created, issue.resolved!, {
        regions: context.holidays.regions,
        workStartHour: context.holidays.workStartHour,
        workEndHour: context.holidays.workEndHour,
        workDaysPerWeek: context.holidays.workDaysPerWeek,
      });
    }, 0);

    const avg = totalHours / resolvedIssues.length;

    return [
      {
        name: 'Avg. Processing Hours',
        value: Math.round(avg * 100) / 100,
        unit: 'hours',
        ticketKeys: resolvedIssues.map((i) => i.key),
        details: [
          { label: 'Resolved Tickets', value: resolvedIssues.length, unit: 'tickets' },
          { label: 'Total Business Hours', value: Math.round(totalHours * 100) / 100, unit: 'hours' },
        ],
      },
    ];
  },
};

export default avgProcessingHoursPlugin;
