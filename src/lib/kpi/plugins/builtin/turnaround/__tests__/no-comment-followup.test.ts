/**
 * Tests for the no_comment_followup plugin:
 * - Controlled synthetic scenarios verify working-day semantics (weekends and
 *   German holidays are excluded from the staleness window).
 * - A smoke test runs the plugin over the real ticket fixture when present
 *   (generate it with `node scratch/export-fixture.cjs`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import noCommentFollowupPlugin from '@/lib/kpi/plugins/builtin/turnaround/no-comment-followup';
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
  } as unknown as JiraIssue;
}

describe('no_comment_followup — working day semantics', () => {
  // Fri 2026-08-14 → Wed 2026-08-19 spans a weekend. Inclusive day count:
  // Fri, Mon, Tue, Wed = 4 working days → counted at 3d threshold, not at 7d.
  it('weekend between last comment and now does not count', () => {
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'T-1', created: '2026-08-01T09:00:00', commentDates: ['2026-08-14T10:00:00'] })),
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(1);
    expect(r7.value).toBe(0);
  });

  it('a German holiday inside the window is excluded', () => {
    // German Unity Day (national) 2025-10-03 is a Friday.
    // Last comment Thu 2025-10-02, now Mon 2025-10-06.
    // Working days inclusive: Thu + Mon = 2 once the holiday is excluded
    // (would be 3 without holiday handling) → below the 3-day threshold.
    const now = new Date('2025-10-06T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'T-2', created: '2025-09-01T09:00:00', commentDates: ['2025-10-02T10:00:00'] })),
    ];
    const [r3] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
  });

  it('tickets with no comments are measured from creation', () => {
    const now = new Date('2026-08-19T12:00:00'); // Wednesday
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'T-3', created: '2026-08-10T09:00:00' })), // Monday, 8 working days back
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(1);
    expect(r7.value).toBe(1);
    expect(r7.details?.find((d) => d.label === 'Never Commented')?.value).toBe(1);
  });

  it('resolved tickets are ignored', () => {
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'T-4', created: '2026-07-01T09:00:00', resolved: '2026-07-02T09:00:00' })),
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
    expect(r7.value).toBe(0);
  });

  it('a recent comment clears the staleness', () => {
    const now = new Date('2026-08-19T12:00:00');
    const issues = [
      transformIssueForKpi(makeRawIssue({
        key: 'T-5',
        created: '2026-07-01T09:00:00',
        commentDates: ['2026-07-05T10:00:00', '2026-08-19T08:00:00'],
      })),
    ];
    const [r3, r7] = noCommentFollowupPlugin.calculate(makeContext(issues, now));
    expect(r3.value).toBe(0);
    expect(r7.value).toBe(0);
  });
});

describe.skipIf(!hasFixture)('no_comment_followup — real data smoke test', () => {
  it('runs over the production fixture and returns consistent counts', () => {
    const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const issues = raws.map((raw: unknown) => transformIssueForKpi(raw as JiraIssue));
    const context = makeContext(issues, new Date());

    const results = noCommentFollowupPlugin.calculate(context);
    expect(results).toHaveLength(2);
    const [r3, r7] = results;

    // 7-day stale set must be a subset of the 3-day set
    expect(r7.value).toBeLessThanOrEqual(r3.value);
    const keys3 = new Set(r3.ticketKeys ?? []);
    for (const k of r7.ticketKeys ?? []) expect(keys3.has(k)).toBe(true);

    // Values must be non-negative integers bounded by open ticket count
    expect(Number.isInteger(r3.value)).toBe(true);
    expect(r3.value).toBeGreaterThanOrEqual(0);
    const openCount = r3.details?.find((d) => d.label === 'Open Tickets')?.value ?? -1;
    expect(r3.value).toBeLessThanOrEqual(openCount);
  });
});
