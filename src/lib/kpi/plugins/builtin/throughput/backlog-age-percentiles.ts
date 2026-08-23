/**
 * Backlog Age Percentiles Plugin
 * Calendar-day age of open tickets as percentiles (P50, P90) plus the oldest.
 * Flags long-forgotten backlog.
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const DAY_MS = 86400000;

const backlogAgePercentilesPlugin: KpiPlugin<KpiResult[]> = {
  id: 'backlog_age_percentiles',
  name: 'Backlog Age Percentiles',
  description:
    'Calendar-day age of open (non-resolved, non-terminal) tickets as percentiles — ' +
    'median (P50), 90th percentile (P90), and the oldest ticket. Flags long-forgotten backlog.',
  category: 'builtin',
  domain: 'throughput',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'horizontal_bar',
  unit: 'days',

  calculate(context: KpiContext): KpiResult[] {
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    if (openIssues.length === 0) {
      return [{ name: 'Backlog Age: Median (P50)', value: 0, unit: 'days' }];
    }

    // Reference "now": period end when it is in the past, otherwise the real current time.
    const referenceNow = context.period?.end && context.period.end.getTime() < Date.now() ? context.period.end : new Date();

    const aged = openIssues.map((issue) => ({
      key: issue.key,
      age: Math.round(((referenceNow.getTime() - issue.created.getTime()) / DAY_MS) * 10) / 10,
    }));
    aged.sort((a, b) => a.age - b.age);
    const ages = aged.map((a) => a.age);
    const n = ages.length;

    // Nearest-rank percentile: index = min(n-1, ceil((p/100) * n) - 1)
    const percentileIndex = (p: number) => Math.min(n - 1, Math.ceil((p / 100) * n) - 1);

    const p50 = ages[percentileIndex(50)];
    const p90 = ages[percentileIndex(90)];
    const maxAge = ages[n - 1];
    const oldest = aged[n - 1];

    return [
      {
        name: 'Backlog Age: Median (P50)',
        value: p50,
        unit: 'days',
        dimensions: { percentile: 'P50' },
        ticketKeys: aged.filter((a) => a.age >= p50).map((a) => a.key),
        details: [{ label: 'Open Tickets', value: n }],
      },
      {
        name: 'Backlog Age: P90',
        value: p90,
        unit: 'days',
        dimensions: { percentile: 'P90' },
        ticketKeys: aged.filter((a) => a.age >= p90).map((a) => a.key),
        details: [{ label: 'Open Tickets', value: n }],
      },
      {
        name: 'Backlog Age: Oldest',
        value: maxAge,
        unit: 'days',
        dimensions: { percentile: 'Max' },
        ticketKeys: [oldest.key],
        details: [
          { label: 'Open Tickets', value: n },
          { label: 'Ticket', value: 0, unit: oldest.key },
        ],
      },
    ];
  },
};

export default backlogAgePercentilesPlugin;
