/**
 * SLA Compliance by Status (Excluding Clones) Plugin
 * SLA compliance by status, excluding tickets with "CLONE" in the title/summary
 * Assignee comments reset the SLA clock
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import slaByStatusPlugin from './sla-by-status';

const slaByStatusExclClonePlugin: KpiPlugin<KpiResult[]> = {
  id: 'sla_by_status_excl_clone',
  name: 'SLA Compliance by Status (Excl. Clones)',
  description: 'SLA compliance by status, excluding tickets with "CLONE" in the title/summary. Assignee comments reset the SLA clock.',
  category: 'builtin',
  domain: 'sla',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'pie',
  unit: '%',

  calculate(context: KpiContext): KpiResult[] {
    // Filter out tickets with "CLONE" in summary (case-sensitive as requested)
    const filteredContext = {
      ...context,
      issues: context.issues.filter((issue) => !issue.summary.includes('CLONE')),
    };
    return slaByStatusPlugin.calculate(filteredContext);
  },
};

export default slaByStatusExclClonePlugin;
