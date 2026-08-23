/**
 * Tests for the first_time_resolution_rate plugin:
 * - Synthetic scenarios verify first-time vs. reassigned classification,
 *   status-only changelogs and unresolved tickets being ignored.
 * - A smoke test runs the plugin over the real ticket fixture when present
 *   (generate it with `node scratch/export-fixture.cjs`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import firstTimeResolutionPlugin from '@/lib/kpi/plugins/builtin/quality/first-time-resolution';
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
    period: { start: new Date(now.getTime() - 365 * 864e5), end: now },
  } as unknown as KpiContext;
}

function makeRawIssue(opts: {
  key: string;
  created: string;
  resolved?: string | null;
  priority?: string;
  assigneeHistories?: Array<{ created: string; from: string | null; to: string | null }>;
}): JiraIssue {
  const histories = opts.assigneeHistories
    ? opts.assigneeHistories.map((h) => ({
        created: h.created,
        author: { displayName: 'Someone' },
        items: [
          { field: 'assignee', fromString: h.from, toString: h.to, from: h.from, to: h.to },
        ],
      }))
    : undefined;
  return {
    key: opts.key,
    fields: {
      summary: `Test ${opts.key}`,
      issuetype: { name: 'Task' },
      status: { name: opts.resolved ? 'Done' : 'In progress (OEM)', statusCategory: { name: opts.resolved ? 'Done' : 'In Progress' } },
      priority: { name: opts.priority ?? 'P2-Medium' },
      assignee: { displayName: 'Someone' },
      reporter: { displayName: 'Someone Else' },
      created: opts.created,
      updated: opts.created,
      resolutiondate: opts.resolved ?? null,
      labels: [],
      comment: { comments: [] },
    },
    ...(histories ? { changelog: { histories } } : {}),
  } as unknown as JiraIssue;
}

describe('first_time_resolution_rate', () => {
  const now = new Date('2026-08-19T12:00:00');

  it('computes the first-time resolution rate from mixed changelogs', () => {
    // First-time: changelog contains only status changes (no assignee change)
    const f2Raw = makeRawIssue({ key: 'F-2', created: '2026-08-17T09:00:00', resolved: '2026-08-17T14:00:00' });
    (f2Raw as unknown as any).changelog = {
      histories: [
        { created: '2026-08-17T10:00:00', items: [{ field: 'status', fromString: 'In progress (OEM)', toString: 'Done', from: 'In progress (OEM)', to: 'Done' }] },
      ],
    };

    const issues = [
      // First-time: resolved with no changelog at all
      transformIssueForKpi(makeRawIssue({ key: 'F-1', created: '2026-08-17T09:00:00', resolved: '2026-08-17T13:00:00' })),
      transformIssueForKpi(f2Raw),
      // Reassigned before resolution
      transformIssueForKpi(makeRawIssue({
        key: 'F-3',
        created: '2026-08-17T09:00:00',
        resolved: '2026-08-17T15:00:00',
        assigneeHistories: [{ created: '2026-08-17T10:00:00', from: 'A', to: 'B' }],
      })),
      // Unresolved with a reassignment — must be ignored
      transformIssueForKpi(makeRawIssue({
        key: 'F-4',
        created: '2026-08-17T09:00:00',
        resolved: null,
        assigneeHistories: [{ created: '2026-08-17T10:00:00', from: 'A', to: 'B' }],
      })),
    ];

    const results = firstTimeResolutionPlugin.calculate(makeContext(issues, now));

    expect(results).toHaveLength(1);
    const r = (results as any[])[0];
    expect(r.name).toBe('First-Time Resolution Rate');
    // 2 first-time of 3 resolved → 66.67%
    expect(r.value).toBe(66.67);
    expect(r.unit).toBe('%');
    expect(r.ticketKeys).toEqual(['F-1', 'F-2']);
    expect(r.details).toEqual([
      { label: 'First-Time Resolved', value: 2 },
      { label: 'Reassigned Before Resolution', value: 1 },
      { label: 'Total Resolved', value: 3 },
    ]);
  });

  it('returns zero when nothing is resolved', () => {
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'F-5', created: '2026-08-17T09:00:00', resolved: null })),
    ];
    const results = firstTimeResolutionPlugin.calculate(makeContext(issues, now));
    expect(results).toEqual([{ name: 'First-Time Resolution Rate', value: 0, unit: '%' }]);
  });
});

describe.skipIf(!hasFixture)('first_time_resolution_rate — real data smoke test', () => {
  it('runs over the fixture with consistent totals', () => {
    const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const issues = raws.map((raw: unknown) => transformIssueForKpi(raw as JiraIssue));
    const results = firstTimeResolutionPlugin.calculate(makeContext(issues, new Date()));

    expect(results).toHaveLength(1);
    const r = (results as any[])[0];
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.value).toBeLessThanOrEqual(100);

    const firstTime = r.details?.find((d: any) => d.label === 'First-Time Resolved')?.value ?? -1;
    const reassigned = r.details?.find((d: any) => d.label === 'Reassigned Before Resolution')?.value ?? -1;
    const totalResolved = r.details?.find((d: any) => d.label === 'Total Resolved')?.value ?? -1;
    const resolvedInFixture = issues.filter((i: any) => i.resolved).length;
    expect(firstTime + reassigned).toBe(totalResolved);
    expect(totalResolved).toBe(resolvedInFixture);

    console.log(`  First-Time Resolution Rate: ${r.value}% (${firstTime} first-time / ${reassigned} reassigned / ${totalResolved} resolved)`);
  });
});
