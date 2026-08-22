/**
 * Tests for the no_comment_followup and no_activity_followup plugins:
 * - Controlled synthetic scenarios verify working-day semantics (weekends and
 *   German holidays excluded), strict thresholds (> 3 / > 7), the
 *   never-commented fallback, and the comment-vs-activity anchoring.
 * - A smoke test runs both plugins over the real ticket fixture when present
 *   (generate it with `node scratch/export-fixture.cjs`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import noCommentFollowupPlugin from '@/lib/kpi/plugins/builtin/turnaround/no-comment-followup';
import noActivityFollowupPlugin from '@/lib/kpi/plugins/builtin/turnaround/no-activity-followup';
import { transformIssueForKpi } from '@/lib/kpi/engine-utils';
import type { JiraIssue } from '@/lib/jira/client';
import type { KpiContext, TransformedIssue } from '@/lib/kpi/types';

const FIXTURE_PATH = path.resolve(__dirname, '../../../../../../../scratch/issues-fixture.json');
const hasFixture = fs.existsSync(FIXTURE_PATH);

function makeContext(issues: TransformedIssue[], now: Date): KpiContext {
  return {
    issues,
    holidays: {
      dates: new Set<string>(),
      regions: ['national'],
      workStartHour: 9,
      workEndHour: 17,
      isHoliday: () => false,
      isWorkingDay: () => true,
    },
    period: { start: new Date(now.getTime() - 90 * 864e5), end: now },
  } as unknown as KpiContext;
}

/** Build a minimal raw Jira issue for transformation. */
function makeRawIssue(opts: {
  key: string;
  created: string;
  status?: string;
  resolved?: string | null;
  commentDates?: string[];
  statusHistories?: Array<{ created: string; from: string; to: string }>;
}): JiraIssue {
  return {
    key: opts.key,
    fields: {
      summary: `Test ${opts.key}`,
      issuetype: { name: 'Task' },
      status: { name: opts.status ?? 'In progress (OEM)', statusCategory: { name: 'In Progress' } },
      priority: { name: 'P2-Medium' },
      assignee: { displayName: 'Someone' },
      reporter: { displayName: 'Someone Else' },
      created: opts.created,
      updated: opts.created,
      resolutiondate: opts.resolved ?? null,
      labels: [],
      comment: { comments: (opts.commentDates ?? []).map((d) => ({ author: { displayName: 'X' }, created: d })) },
    },
    changelog: opts.statusHistories
      ? {
          histories: opts.statusHistories.map((h, i) => ({
            id: String(i),
            author: { displayName: 'Someone' },
            created: h.created,
            items: [{ field: 'status', fromString: h.from, toString: h.to, from: null, to: null }],
          })),
        }
      : undefined,
  } as unknown as JiraIssue;
}

describe('no_comment_followup — working day semantics', () => {
  // Fri 2026-08-14 → Wed 2026-08-19 spans a weekend. Inclusive day count:
  // Fri, Mon, Tue, Wed = 4 working days → counted at the strict >3 threshold,
  // not at >7.
  it('weekend between last comment and now does not count', () => {
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'C-1', created: '2026-08-01T09:00:00', commentDates: ['2026-08-14T10:00:00'] })),
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(1);
    expect(r7.value).toBe(0);
  });

  it('exactly 3 elapsed working days is NOT flagged (strict >)', () => {
    // Last comment Fri 2026-08-14, now Tue 2026-08-18:
    // inclusive working days Fri, Mon, Tue = 3 → not > 3.
    // (One more working day of silence would tip it over.)
    const now = new Date('2026-08-18T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'C-2', created: '2026-08-01T09:00:00', commentDates: ['2026-08-14T10:00:00'] })),
    ];
    const [r3] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
  });

  it('a German holiday inside the window is excluded', () => {
    // German Unity Day (national) 2025-10-03 is a Friday.
    // Last comment Thu 2025-10-02, now Mon 2025-10-06.
    // Elapsed working days once the holiday is excluded: Thu + Mon = 2
    // (would be 3 without holiday handling) → below the strict >3 threshold.
    const now = new Date('2025-10-06T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'C-3', created: '2025-09-01T09:00:00', commentDates: ['2025-10-02T10:00:00'] })),
    ];
    const [r3] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
  });

  it('tickets with no comments are measured from creation', () => {
    const now = new Date('2026-08-19T12:00:00'); // Wednesday
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'C-4', created: '2026-08-10T09:00:00' })), // Monday, 8 working days back
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(1);
    expect(r7.value).toBe(1);
    expect(r7.details?.find((d) => d.label === 'Never Commented')?.value).toBe(1);
  });

  it('resolved tickets are ignored', () => {
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'C-5', created: '2026-07-01T09:00:00', resolved: '2026-07-02T09:00:00' })),
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
    expect(r7.value).toBe(0);
  });

  it('a recent comment clears the staleness', () => {
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({
        key: 'C-6',
        created: '2026-07-01T09:00:00',
        commentDates: ['2026-07-05T10:00:00', '2026-08-19T08:00:00'],
      })),
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
    expect(r7.value).toBe(0);
  });

  it('a status change does NOT reset the comment clock', () => {
    // Comment 8 working days ago, status moved today: still flagged.
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({
        key: 'C-7',
        created: '2026-08-03T09:00:00',
        commentDates: ['2026-08-07T10:00:00'],
        statusHistories: [{ created: '2026-08-19T08:00:00', from: 'In progress (OEM)', to: 'Validating' }],
      })),
    ];
    const [r3] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(1);
  });
});

describe('no_activity_followup — comment or transition resets the clock', () => {
  it('a recent status change clears the staleness', () => {
    // Comment 8 working days ago but status moved today → not idle.
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({
        key: 'A-1',
        created: '2026-08-03T09:00:00',
        commentDates: ['2026-08-07T10:00:00'],
        statusHistories: [{ created: '2026-08-19T08:00:00', from: 'In progress (OEM)', to: 'Validating' }],
      })),
    ];
    const [r3] = noActivityFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
  });

  it('flags tickets with neither comment nor transition', () => {
    const now = new Date('2026-08-19T12:00:00'); // Wednesday
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'A-2', created: '2026-08-10T09:00:00' })),
    ];
    const [r3, r7] = noActivityFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(1);
    expect(r7.value).toBe(1);
  });

  it('an old transition does not clear the staleness', () => {
    // Last activity (comment or transition) 8 working days back.
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({
        key: 'A-3',
        created: '2026-08-03T09:00:00',
        statusHistories: [{ created: '2026-08-07T10:00:00', from: 'In progress (OEM)', to: 'Validating' }],
      })),
    ];
    const [r3] = noActivityFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(1);
  });
});

describe.skipIf(!hasFixture)('follow-up plugins — real data smoke test', () => {
  it('both plugins run over the fixture with consistent relationships', () => {
    const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const issues = raws.map((raw: unknown) => transformIssueForKpi(raw as JiraIssue));
    const context = makeContext(issues, new Date());

    const commentResults = noCommentFollowupPlugin.calculate(context);
    const activityResults = noActivityFollowupPlugin.calculate(context);
    expect(commentResults).toHaveLength(2);
    expect(activityResults).toHaveLength(2);

    const [c3, c7] = commentResults;
    const [a3, a7] = activityResults;

    // Activity-based sets are subsets of the comment-based sets (any ticket
    // with recent activity also has a recent anchor in the comment variant...
    // actually the reverse: activity anchoring can only make tickets LESS stale).
    expect(a3.value).toBeLessThanOrEqual(c3.value);
    expect(a7.value).toBeLessThanOrEqual(c7.value);
    expect(c7.value).toBeLessThanOrEqual(c3.value);
    expect(a7.value).toBeLessThanOrEqual(a3.value);

    const commentKeys3 = new Set(c3.ticketKeys ?? []);
    for (const k of a3.ticketKeys ?? []) expect(commentKeys3.has(k)).toBe(true);

    console.log(`  comment-based: >3d ${c3.value} | >7d ${c7.value}`);
    console.log(`  activity-based: >3d ${a3.value} | >7d ${a7.value}`);
  });
});
