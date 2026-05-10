/**
 * SLA Compliance Rate Plugin
 * Percentage of tickets resolved within the configured SLA target (business hours)
 */

import { calculateBusinessHours } from '../../../../holidays/german-holidays';
import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';

const slaCompliancePlugin: KpiPlugin = {
  id: 'sla_compliance',
  name: 'SLA Compliance Rate',
  description: 'Percentage of tickets resolved within the configured SLA target (business hours).',
  category: 'builtin',
  domain: 'sla',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: '%',

  calculate(context: KpiContext): KpiResult[] {
    const slaTargetHours = context.holidays.slaTargetHours || 40; // Use configured target, default to 40
    const resolvedIssues = context.issues.filter((i) => i.resolved);
    if (resolvedIssues.length === 0) {
      return [{ name: 'SLA Compliance Rate', value: 0, unit: '%' }];
    }

    const withinSlaIssues = resolvedIssues.filter((issue) => {
      const hours = calculateBusinessHours(issue.created, issue.resolved!, context.holidays);
      return hours <= slaTargetHours;
    });

    const rate = (withinSlaIssues.length / resolvedIssues.length) * 100;

    return [
      {
        name: 'SLA Compliance Rate',
        value: Math.round(rate * 100) / 100,
        unit: '%',
        ticketKeys: withinSlaIssues.map((i) => i.key),
        details: [
          { label: 'Within SLA', value: withinSlaIssues.length, unit: 'tickets' },
          { label: 'Breached SLA', value: resolvedIssues.length - withinSlaIssues.length, unit: 'tickets' },
          { label: 'SLA Target', value: slaTargetHours, unit: 'hours' },
        ],
      },
    ];
  },
};

export default slaCompliancePlugin;
