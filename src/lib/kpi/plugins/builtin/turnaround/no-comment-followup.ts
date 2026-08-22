/**
 * No Comment Follow-up Plugin
 * Open tickets that have received no new comment for more than 3 / 7 working
 * days. Working days exclude weekends and German holidays. Tickets without any
 * comment are measured from their creation date.
 */

import type { KpiPlugin, KpiContext, KpiResult, TransformedIssue } from '../../../types';
import { isIssueDone } from '../../../engine-utils';
import { calculateWorkingDays } from '../../../../holidays/german-holidays';
import type { GermanState } from '../../../../holidays/german-holidays';

/** Strict thresholds: "> 3" means three FULL working days have elapsed. */
export const FOLLOWUP_THRESHOLDS = [3, 7];

/**
 * Reference "now": period end when it is in the past (historical views),
 * otherwise the real current time.
 */
export function followupReferenceNow(periodEnd?: Date): Date {
  return periodEnd && periodEnd.getTime() < Date.now() ? periodEnd : new Date();
}

/** Date of the newest comment, or null when the ticket has none. */
export function lastCommentDate(issue: TransformedIssue): Date | null {
  return issue.comments?.length ? issue.comments[issue.comments.length - 1].created : null;
}

export interface StaleEntry {
  issue: TransformedIssue;
  workingDays: number;
  neverCommented: boolean;
}

/**
 * Open tickets whose activity anchor is older than the smallest threshold,
 * measured in working days (weekends + German holidays excluded).
 */
export function staleOpenTickets(
  issues: TransformedIssue[],
  now: Date,
  regions: GermanState[],
  anchorOf: (issue: TransformedIssue) => Date,
  minDays: number
): StaleEntry[] {
  return issues
    .filter((i) => !isIssueDone(i))
    .map((issue) => ({
      issue,
      workingDays: calculateWorkingDays(anchorOf(issue), now, regions),
      neverCommented: !issue.comments?.length,
    }))
    .filter((entry) => entry.workingDays > minDays);
}

/** Builds the 3-day/7-day result pair from pre-filtered stale entries. */
export function buildFollowupResults(
  openCount: number,
  stale: StaleEntry[],
  label: (days: number) => string,
  unit: (days: number) => string
): KpiResult[] {
  return FOLLOWUP_THRESHOLDS.map((days) => {
    const matching = stale.filter((entry) => entry.workingDays > days);
    const neverCommented = matching.filter((entry) => entry.neverCommented).length;

    return {
      name: label(days),
      value: matching.length,
      unit: unit(days),
      ticketKeys: matching.map((entry) => entry.issue.key),
      details: [
        { label: 'Open Tickets', value: openCount, unit: 'tickets' },
        { label: 'Never Commented', value: neverCommented, unit: 'tickets' },
        { label: 'Threshold', value: days, unit: 'working days, strict (>)' },
      ],
    };
  });
}

const noCommentFollowupPlugin: KpiPlugin<KpiResult[]> = {
  id: 'no_comment_followup',
  name: 'No Comment Follow-up',
  description:
    'Open tickets with no new comment for more than 3 or 7 working days (weekends and German ' +
    'holidays excluded). Tickets without any comment are measured from creation. Status changes ' +
    'do NOT reset the clock — use No Activity Follow-up for that variant.',
  category: 'builtin',
  domain: 'turnaround',
  version: '2.0.0',
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
      (issue) => lastCommentDate(issue) ?? issue.created,
      FOLLOWUP_THRESHOLDS[0]
    );

    return buildFollowupResults(
      openIssues.length,
      stale,
      (days) => `No Comment > ${days} Working Days`,
      (days) => `>${days} working days`
    );
  },
};

export default noCommentFollowupPlugin;
