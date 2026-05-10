/**
 * Throughput Plugin
 * Overview of ticket activity: Created, Resolved, and currently Open
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const throughputPlugin: KpiPlugin = {
  id: 'throughput',
  name: 'Throughput',
  description: 'Overview of ticket activity: Created, Resolved, and currently Open.',
  category: 'builtin',
  domain: 'throughput',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const createdIssues = context.issues.filter((i) => i.created >= context.period.start && i.created <= context.period.end);

    const resolvedIssues = context.issues.filter(
      (i) => i.resolved && i.resolved >= context.period.start && i.resolved <= context.period.end
    );

    const openIssues = context.issues.filter((i) => {
      const createdBeforeEnd = i.created <= context.period.end;
      // An issue is NOT open if it was resolved before the period end OR if it's currently Done (fallback for missing resolution date)
      const isActuallyDone = isIssueDone(i);
      const notYetResolved = (!i.resolved && !isActuallyDone) || (i.resolved && i.resolved > context.period.end);
      return createdBeforeEnd && notYetResolved;
    });

    const periodDays = Math.max(
      Math.ceil((context.period.end.getTime() - context.period.start.getTime()) / (1000 * 60 * 60 * 24)),
      1
    );

    return [
      {
        name: 'Resolved Tickets',
        value: resolvedIssues.length,
        unit: 'tickets',
        ticketKeys: resolvedIssues.map((i) => i.key),
        details: [
          {
            label: 'Avg. Resolved/Day',
            value: Math.round((resolvedIssues.length / periodDays) * 100) / 100,
            unit: 'tickets/day',
          },
        ],
      },
      {
        name: 'Created Tickets',
        value: createdIssues.length,
        unit: 'tickets',
        ticketKeys: createdIssues.map((i) => i.key),
      },
      {
        name: 'Open Tickets',
        value: openIssues.length,
        unit: 'tickets',
        ticketKeys: openIssues.map((i) => i.key),
      },
    ];
  },
};

export default throughputPlugin;
