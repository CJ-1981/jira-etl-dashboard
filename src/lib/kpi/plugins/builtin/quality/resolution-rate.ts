/**
 * Resolution Rate Plugin
 * Percentage of created tickets that have been resolved
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';

const resolutionRatePlugin: KpiPlugin = {
  id: 'resolution_rate',
  name: 'Resolution Rate',
  description: 'Percentage of created tickets that have been resolved.',
  category: 'builtin',
  domain: 'quality',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: '%',

  calculate(context: KpiContext): KpiResult[] {
    const total = context.issues.length;
    if (total === 0) {
      return [{ name: 'Resolution Rate', value: 0, unit: '%' }];
    }

    const resolvedIssues = context.issues.filter((i) => isIssueDone(i));
    const resolved = resolvedIssues.length;
    const rate = (resolved / total) * 100;

    return [
      {
        name: 'Resolution Rate',
        value: Math.round(rate * 100) / 100,
        unit: '%',
        ticketKeys: resolvedIssues.map((i) => i.key),
        details: [
          { label: 'Resolved', value: resolved },
          { label: 'Open', value: total - resolved },
        ],
      },
    ];
  },
};

export default resolutionRatePlugin;
