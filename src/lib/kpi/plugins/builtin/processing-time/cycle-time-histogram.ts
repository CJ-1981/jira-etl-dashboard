/**
 * Cycle Time Histogram Plugin
 * Buckets resolved tickets into time ranges based on business hours from creation to resolution
 * @MX:NOTE: Aging WIP Analysis - Buckets open tickets by time-since-creation (business hours)
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const cycleTimeHistogramPlugin: KpiPlugin = {
  id: 'cycle_time_histogram',
  name: 'Cycle Time Histogram',
  description: 'Buckets resolved tickets into time ranges based on business hours from creation to resolution.',
  category: 'builtin',
  domain: 'processing-time',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const resolvedIssues = context.issues.filter((i) => i.resolved);

    const buckets = [
      { label: '< 4h', min: 0, max: 4 },
      { label: '4-8h (1d)', min: 4, max: 8 },
      { label: '8-16h (2d)', min: 8, max: 16 },
      { label: '16-40h (1w)', min: 16, max: 40 },
      { label: '40-80h (2w)', min: 40, max: 80 },
      { label: '> 80h (2w+)', min: 80, max: Infinity },
    ];

    const results: Record<string, { count: number; keys: string[] }> = {};
    buckets.forEach((b) => (results[b.label] = { count: 0, keys: [] }));

    for (const issue of resolvedIssues) {
      const hours = calculateBusinessHours(issue.created, issue.resolved!, {
        regions: context.holidays.regions,
        workStartHour: context.holidays.workStartHour,
        workEndHour: context.holidays.workEndHour,
        workDaysPerWeek: context.holidays.workDaysPerWeek,
      });
      const bucket = buckets.find((b) => hours >= b.min && hours < b.max);
      if (bucket) {
        results[bucket.label].count++;
        results[bucket.label].keys.push(issue.key);
      }
    }

    return buckets.map((b) => ({
      name: b.label,
      value: results[b.label].count,
      unit: 'tickets',
      dimensions: { bucket: b.label },
      ticketKeys: results[b.label].keys,
      details: [
        { label: 'Range', value: 0, unit: b.label },
        { label: 'Total Tickets', value: results[b.label].count },
      ],
    }));
  },
};

export default cycleTimeHistogramPlugin;
