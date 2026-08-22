/**
 * Tests for the priority_inflow_trend plugin:
 * - Synthetic scenarios verify weekly grouping, priority separation and
 *   zero-period filling.
 * - A smoke test runs the plugin over the real ticket fixture when present
 *   (generate it with `node scratch/export-fixture.cjs`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import priorityInflowPlugin from '@/lib/kpi/plugins/time-series/throughput/priority-inflow-weekly';
import { transformIssueForKpi } from '@/lib/kpi/engine-utils';
import type { JiraIssue } from '@/lib/jira/client';
import type { KpiContext, TransformedIssue } from '@/lib/kpi/types';

const FIXTURE_PATH = path.resolve(__dirname, '../../../../../../scratch/issues-fixture.json');
const hasFixture = fs.existsSync(FIXTURE_PATH);

function makeContext(issues: TransformedIssue[], start: Date, end: Date): KpiContext {
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
    period: { start, end },
  } as unknown as KpiContext;
}

function makeRawIssue(opts: { key: string; created: string; priority?: string }): JiraIssue {
  return {
    key: opts.key,
    fields: {
      summary: `Test ${opts.key}`,
      issuetype: { name: 'Task' },
      status: { name: 'In progress (OEM)', statusCategory: { name: 'In Progress' } },
      priority: { name: opts.priority ?? 'P2-Medium' },
      assignee: { displayName: 'Someone' },
      reporter: { displayName: 'Someone Else' },
      created: opts.created,
      updated: opts.created,
      resolutiondate: null,
      labels: [],
      comment: { comments: [] },
    },
  } as unknown as JiraIssue;
}

describe('priority_inflow_trend — weekly grouping', () => {
  // ISO weeks: 2026-08-10 is Monday of week 33, 2026-08-17 Monday of week 34.
  const start = new Date('2026-08-03T00:00:00');
  const end = new Date('2026-08-23T23:59:59');

  it('groups created tickets by week and priority', () => {
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'T-1', created: '2026-08-11T09:00:00Z', priority: 'P0-Urgent' })),
      transformIssueForKpi(makeRawIssue({ key: 'T-2', created: '2026-08-12T09:00:00Z', priority: 'P0-Urgent' })),
      transformIssueForKpi(makeRawIssue({ key: 'T-3', created: '2026-08-11T10:00:00Z', priority: 'P2-Medium' })),
      transformIssueForKpi(makeRawIssue({ key: 'T-4', created: '2026-08-19T09:00:00Z', priority: 'P0-Urgent' })),
    ];
    const results = priorityInflowPlugin.calculate(makeContext(issues, start, end));

    const p0 = results.find((r) => r.dimensions?.priority === 'P0-Urgent');
    const p2 = results.find((r) => r.dimensions?.priority === 'P2-Medium');
    expect(p0).toBeDefined();
    expect(p2).toBeDefined();

    const week33 = (p0!.timeSeries ?? []).find((p) => p.period === '2026-W33');
    const week34 = (p0!.timeSeries ?? []).find((p) => p.period === '2026-W34');
    expect(week33?.value).toBe(2);
    expect(week34?.value).toBe(1);
    expect((p2!.timeSeries ?? []).find((p) => p.period === '2026-W33')?.value).toBe(1);
    expect((p2!.timeSeries ?? []).find((p) => p.period === '2026-W34')?.value).toBe(0);
  });

  it('orders series P0 → P3', () => {
    // Unique keys: transformIssueForKpi caches by key+updated across the file
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'O-1', created: '2026-08-11T09:00:00Z', priority: 'P3-Low' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-2', created: '2026-08-11T09:00:00Z', priority: 'P0-Urgent' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-3', created: '2026-08-11T09:00:00Z', priority: 'P1-High' })),
    ];
    const results = priorityInflowPlugin.calculate(makeContext(issues, start, end));
    expect(results.map((r) => r.dimensions?.priority)).toEqual(['P0-Urgent', 'P1-High', 'P3-Low']);
  });

  it('returns an empty series result for no issues', () => {
    const results = priorityInflowPlugin.calculate(makeContext([], start, end));
    expect(results).toHaveLength(1);
    expect(results[0].timeSeries).toEqual([]);
  });
});

describe.skipIf(!hasFixture)('priority_inflow_trend — real data smoke test', () => {
  it('runs over the production fixture and covers the observed priorities', () => {
    const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const issues = raws.map((raw: unknown) => transformIssueForKpi(raw as JiraIssue));
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 864e5);

    const results = priorityInflowPlugin.calculate(makeContext(issues, start, end));

    const priorities = results.map((r) => r.dimensions?.priority);
    expect(priorities).toContain('P0-Urgent');
    expect(priorities).toContain('P1-High');

    const totalCreated = results.reduce((sum, r) => sum + (r.details?.find((d) => d.label === 'Total Created')?.value ?? 0), 0);
    expect(totalCreated).toBe(issues.length);

    for (const r of results) {
      const series = r.timeSeries ?? [];
      expect(series.length).toBeGreaterThan(0);
      for (const point of series) {
        expect(Number.isInteger(point.value)).toBe(true);
        expect(point.value).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
