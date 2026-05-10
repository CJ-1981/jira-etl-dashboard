/**
 * Aging WIP Analysis Plugin
 * Buckets open (non-resolved) tickets by how long they have been open in business hours
 * @MX:NOTE: First Response Time - Average business hours from creation to first human response
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const agingWipPlugin: KpiPlugin = {
  id: 'aging_wip',
  name: 'Aging WIP Analysis',
  description: 'Buckets open (non-resolved) tickets by how long they have been open in business hours.',
  category: 'builtin',
  domain: 'processing-time',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    const buckets = [
      { label: '< 1 day', min: 0, max: 8 },
      { label: '1-3 days', min: 8, max: 24 },
      { label: '3-7 days', min: 24, max: 56 },
      { label: '1-2 weeks', min: 56, max: 112 },
      { label: '2-4 weeks', min: 112, max: 224 },
      { label: '> 4 weeks', min: 224, max: Infinity },
    ];

    const results: Record<string, { count: number; keys: string[] }> = {};
    buckets.forEach((b) => (results[b.label] = { count: 0, keys: [] }));

    for (const issue of openIssues) {
      const hours = calculateBusinessHours(issue.created, new Date(), context.holidays);
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
        { label: 'Age Range', value: 0, unit: b.label },
        { label: 'Total Tickets', value: results[b.label].count },
      ],
    }));
  },
};

export default agingWipPlugin;
