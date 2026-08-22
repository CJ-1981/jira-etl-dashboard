/**
 * No Comment Follow-up Plugin
 * Open tickets that have received no new comment for 3 / 7 working days.
 * Working days exclude weekends and German holidays. Tickets without any
 * comment are measured from their creation date.
 */

import type { KpiPlugin, KpiContext, KpiResult } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import { calculateWorkingDays } from '../../../../holidays/german-holidays';

const THRESHOLDS = [
  { days: 3, name: 'No Comment ≥ 3 Working Days', unit: '3+ working days' },
  { days: 7, name: 'No Comment ≥ 7 Working Days', unit: '7+ working days' },
];

const noCommentFollowupPlugin: KpiPlugin<KpiResult[]> = {
  id: 'no_comment_followup',
  name: 'No Comment Follow-up',
  description:
    'Open tickets with no new comment for 3 or 7 working days (weekends and German holidays excluded). ' +
    'Tickets without any comment are measured from creation. Identifies stale tickets waiting for a response.',
  category: 'builtin',
  domain: 'turnaround',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    // Reference "now": period end when it is in the past (historical views),
    // otherwise the real current time.
    const periodEnd = context.period?.end;
    const now = periodEnd && periodEnd.getTime() < Date.now() ? periodEnd : new Date();

    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    // Last activity that counts as "someone commented": newest comment, or
    // creation date when the ticket never received a comment.
    const stale = openIssues
      .map((issue) => {
        const lastComment = issue.comments?.length
          ? issue.comments[issue.comments.length - 1].created
          : null;
        const since = lastComment ?? issue.created;
        const workingDays = calculateWorkingDays(since, now, context.holidays.regions);
        return { issue, workingDays, neverCommented: !lastComment };
      })
      .filter((entry) => entry.workingDays >= THRESHOLDS[0].days);

    return THRESHOLDS.map(({ days, name, unit }) => {
      const matching = stale.filter((entry) => entry.workingDays >= days);
      const neverCommented = matching.filter((entry) => entry.neverCommented).length;

      return {
        name,
        value: matching.length,
        unit,
        ticketKeys: matching.map((entry) => entry.issue.key),
        details: [
          { label: 'Open Tickets', value: openIssues.length, unit: 'tickets' },
          { label: 'Never Commented', value: neverCommented, unit: 'tickets' },
          { label: 'Threshold', value: days, unit: 'working days' },
        ],
      };
    });
  },
};

export default noCommentFollowupPlugin;
