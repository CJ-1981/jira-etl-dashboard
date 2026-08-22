/**
 * No Activity Follow-up Plugin
 * Open tickets with no comment AND no status change for more than 3 / 7
 * working days. Either a new comment or a status transition resets the clock.
 * Working days exclude weekends and German holidays.
 */

import type { KpiPlugin, KpiContext, KpiResult, TransformedIssue } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import {
  FOLLOWUP_THRESHOLDS,
  buildFollowupResults,
  followupReferenceNow,
  lastCommentDate,
  staleOpenTickets,
} from './no-comment-followup';

/** Newest of last comment, last status transition, and creation date. */
function lastActivityDate(issue: TransformedIssue): Date {
  const candidates: Date[] = [issue.created];
  const lastComment = lastCommentDate(issue);
  if (lastComment) candidates.push(lastComment);
  if (issue.transitions?.length) {
    candidates.push(issue.transitions[issue.transitions.length - 1].occurredAt);
  }
  return candidates.reduce((latest, d) => (d.getTime() > latest.getTime() ? d : latest));
}

const noActivityFollowupPlugin: KpiPlugin<KpiResult[]> = {
  id: 'no_activity_followup',
  name: 'No Activity Follow-up',
  description:
    'Open tickets with no comment and no status change for more than 3 or 7 working days ' +
    '(weekends and German holidays excluded). Either activity resets the clock; tickets with ' +
    'neither are measured from creation. Use No Comment Follow-up to ignore status changes.',
  category: 'builtin',
  domain: 'turnaround',
  version: '1.0.0',
  pluginType: 'builtin',
  isActive: true,
  visualization: 'card',
  unit: 'tickets',

  calculate(context: KpiContext): KpiResult[] {
    const now = followupReferenceNow(context.period?.end);
    const openIssues = context.issues.filter((i) => !isIssueDone(i));

    const stale = staleOpenTickets(
      openIssues,
      now,
      context.holidays.regions,
      lastActivityDate,
      FOLLOWUP_THRESHOLDS[0]
    );

    return buildFollowupResults(
      openIssues.length,
      stale,
      (days) => `No Activity > ${days} Working Days`,
      (days) => `>${days} working days`
    );
  },
};

export default noActivityFollowupPlugin;
