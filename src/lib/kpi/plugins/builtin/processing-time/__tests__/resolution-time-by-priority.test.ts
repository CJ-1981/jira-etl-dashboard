/**
 * Tests for the resolution_time_by_priority plugin:
 * - Synthetic scenarios verify priority grouping, business-hour averaging and
 *   P0 → P3 ordering.
 * - A smoke test runs the plugin over the real ticket fixture when present
 *   (generate it with `node scratch/export-fixture.cjs`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import resolutionTimeByPriorityPlugin from '@/lib/kpi/plugins/builtin/processing-time/resolution-time-by-priority';
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
}): JiraIssue {
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
  } as unknown as JiraIssue;
}

describe('resolution_time_by_priority', () => {
  const now = new Date('2026-08-19T12:00:00');

  it('averages business hours per priority and orders P0 → P3', () => {
    const issues = [
      // Two resolved P1s plus an unresolved one (ignored)
      transformIssueForKpi(makeRawIssue({ key: 'R-1', created: '2026-08-17T09:00:00', resolved: '2026-08-17T13:00:00', priority: 'P1-High' })),
      transformIssueForKpi(makeRawIssue({ key: 'R-2', created: '2026-08-17T09:00:00', resolved: '2026-08-17T17:00:00', priority: 'P1-High' })),
      transformIssueForKpi(makeRawIssue({ key: 'R-3', created: '2026-08-17T09:00:00', resolved: null, priority: 'P1-High' })),
      // One resolved P0
      transformIssueForKpi(makeRawIssue({ key: 'R-4', created: '2026-08-17T09:00:00', resolved: '2026-08-17T11:00:00', priority: 'P0-Urgent' })),
    ];
    const results = resolutionTimeByPriorityPlugin.calculate(makeContext(issues, now));

    expect(results.map((r) => r.dimensions?.priority)).toEqual(['P0-Urgent', 'P1-High']);

    const p1 = results.find((r) => r.dimensions?.priority === 'P1-High')!;
    expect(p1.details?.find((d) => d.label === 'Resolved Tickets')?.value).toBe(2);
    // Both resolved the same day: 4h and 8h business hours → avg 6h
    expect(p1.value).toBe(6);

    const p0 = results.find((r) => r.dimensions?.priority === 'P0-Urgent')!;
    expect(p0.value).toBe(2);
    expect(p0.ticketKeys).toEqual(['R-4']);
  });

  it('returns an empty array when nothing is resolved', () => {
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'R-5', created: '2026-08-17T09:00:00', resolved: null })),
    ];
    expect(resolutionTimeByPriorityPlugin.calculate(makeContext(issues, now))).toEqual([]);
  });
});

describe.skipIf(!hasFixture)('resolution_time_by_priority — real data smoke test', () => {
  it('runs over the fixture with consistent totals', () => {
    const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const issues = raws.map((raw: unknown) => transformIssueForKpi(raw as JiraIssue));
    const results = resolutionTimeByPriorityPlugin.calculate(makeContext(issues, new Date()));

    expect(results.length).toBeGreaterThan(0);
    const totalResolved = results.reduce((sum, r) => sum + (r.details?.find((d) => d.label === 'Resolved Tickets')?.value ?? 0), 0);
    const resolvedInFixture = issues.filter((i) => i.resolved).length;
    expect(totalResolved).toBe(resolvedInFixture);

    for (const r of results) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.value)).toBe(true);
    }

    console.log(`  ${results.map((r) => `${r.dimensions?.priority}: ${r.value}h (${r.details?.find((d) => d.label === 'Resolved Tickets')?.value})`).join(' | ')}`);
  });
});
