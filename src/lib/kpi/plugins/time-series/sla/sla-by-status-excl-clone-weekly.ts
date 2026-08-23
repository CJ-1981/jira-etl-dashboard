/**
 * SLA Compliance by Status Trend (Excl. Clones) - Weekly
 *
 * SLA compliance rate for each workflow status per week, excluding clones
 * Delegates to the shared status-trend calculation with the comment-based
 * SLA clock reset enabled, mirroring how the builtin excl-clone card
 * delegates to sla-by-status.
 */

import { type KpiPlugin, type KpiContext } from '../../../types';
import type { TimeSeriesResult } from '../../../types-time-series';
import { calculateSlaByStatusTrend } from './sla-by-status-weekly';

// ─── Plugin Definition ───────────────────────────────────────────────────────────

const slaByStatusExclCloneWeeklyPlugin: KpiPlugin<TimeSeriesResult[]> = {
  id: 'sla_by_status_excl_clone_trend',
  name: 'SLA Compliance by Status Trend (Excl. Clones)',
  description: 'SLA compliance rate for each workflow status, excluding tickets with "CLONE" in the title, grouped by week. Only counts completed status durations.',
  category: 'time-series',
  domain: 'sla',
  version: '1.0.0',
  unit: '%',
  timeInterval: 'weekly',
  calculate(context: KpiContext) {
    // Filter out tickets with "CLONE" in summary (case-sensitive as requested)
    const filteredContext = {
      ...context,
      issues: context.issues.filter(issue => !(issue.summary || '').includes('CLONE'))
    };
    // @MX:NOTE: Comment-based clock reset enabled to stay consistent with the
    // builtin sla_by_status_excl_clone card.
    return calculateSlaByStatusTrend(filteredContext, 'weekly', { useCommentBasedReset: true });
  },
};

export default slaByStatusExclCloneWeeklyPlugin;
