/**
 * Median Processing Hours Plugin
 * Calculates median business hours from creation to resolution
 * Excludes weekends and German holidays
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const medianProcessingHoursPlugin: KpiPlugin = {
  id: 'median_processing_hours',
  name: 'Median Processing Hours',
  description: 'Median business hours from creation to resolution, excluding holidays.',
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
      return [{ name: 'Median Processing Hours', value: 0, unit: 'hours' }];
    }

    const hours = resolvedIssues
      .map((issue) => calculateBusinessHours(issue.created, issue.resolved!, context.holidays))
      .sort((a, b) => a - b);

    const mid = Math.floor(hours.length / 2);
    const median = hours.length % 2 !== 0 ? hours[mid] : (hours[mid - 1] + hours[mid]) / 2;

    return [
      {
        name: 'Median Processing Hours',
        value: Math.round(median * 100) / 100,
        unit: 'hours',
        ticketKeys: resolvedIssues.map((i) => i.key),
      },
    ];
  },
};

export default medianProcessingHoursPlugin;
