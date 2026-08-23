/**
 * Tests for the backlog_age_percentiles plugin:
 * - Synthetic scenarios verify percentile math (nearest-rank), ordering of the
 *   three results, and exclusion of resolved/terminal tickets.
 * - A smoke test runs the plugin over the real ticket fixture when present
 *   (generate it with `node scratch/export-fixture.cjs`).
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import backlogAgePercentilesPlugin from '@/lib/kpi/plugins/builtin/throughput/backlog-age-percentiles';
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

describe('backlog_age_percentiles', () => {
  const now = new Date('2026-08-19T12:00:00');

  it('computes P50/P90/Max over open tickets and ignores resolved ones', () => {
    const issues = [
      // 10 open tickets with known calendar-day ages relative to `now`:
      // 0, 1, 3, 7, 14, 30, 45, 60, 90, 181 days
      transformIssueForKpi(makeRawIssue({ key: 'O-1', created: '2026-08-19T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-2', created: '2026-08-18T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-3', created: '2026-08-16T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-4', created: '2026-08-12T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-5', created: '2026-08-05T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-6', created: '2026-07-20T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-7', created: '2026-07-05T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-8', created: '2026-06-20T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-9', created: '2026-05-21T12:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'O-10', created: '2026-02-19T12:00:00' })),
      // Resolved/terminal tickets that must be ignored (one ancient on purpose)
      transformIssueForKpi(makeRawIssue({ key: 'R-1', created: '2025-01-01T09:00:00', resolved: '2026-08-01T09:00:00' })),
      transformIssueForKpi(makeRawIssue({ key: 'R-2', created: '2025-06-01T09:00:00', resolved: '2026-07-01T09:00:00' })),
    ];
    const results = backlogAgePercentilesPlugin.calculate(makeContext(issues, now));

    // Ordering and names of the three results
    expect(results.map((r) => r.name)).toEqual([
      'Backlog Age: Median (P50)',
      'Backlog Age: P90',
      'Backlog Age: Oldest',
    ]);
    expect(results.map((r) => r.dimensions?.percentile)).toEqual(['P50', 'P90', 'Max']);

    // Sorted ages: [0, 1, 3, 7, 14, 30, 45, 60, 90, 181] (n = 10)
    // Nearest-rank: P50 → index ceil(5)-1 = 4 → 14; P90 → index ceil(9)-1 = 8 → 90; Max → 181
    const [p50, p90, oldest] = results;
    expect(p50.value).toBe(14);
    expect(p90.value).toBe(90);
    expect(oldest.value).toBe(181);

    for (const r of results) {
      expect(r.unit).toBe('days');
      expect(r.details?.find((d) => d.label === 'Open Tickets')?.value).toBe(10);
    }

    // Resolved tickets excluded from every result
    for (const r of results) {
      expect(r.ticketKeys).not.toContain('R-1');
      expect(r.ticketKeys).not.toContain('R-2');
    }

    // Oldest result exposes the oldest ticket key
    expect(oldest.ticketKeys).toEqual(['O-10']);
    expect(oldest.details?.find((d) => d.label === 'Ticket')?.unit).toBe('O-10');

    // P50/P90 carry the tickets at/above the threshold
    expect(p50.ticketKeys).toEqual(['O-5', 'O-6', 'O-7', 'O-8', 'O-9', 'O-10']);
    expect(p90.ticketKeys).toEqual(['O-9', 'O-10']);
  });

  it('returns a single zero result when there are no open tickets', () => {
    const issues = [
      transformIssueForKpi(makeRawIssue({ key: 'R-3', created: '2026-01-01T09:00:00', resolved: '2026-02-01T09:00:00' })),
    ];
    expect(backlogAgePercentilesPlugin.calculate(makeContext(issues, now))).toEqual([
      { name: 'Backlog Age: Median (P50)', value: 0, unit: 'days' },
    ]);
  });
});

describe.skipIf(!hasFixture)('backlog_age_percentiles — real data smoke test', () => {
  it('runs over the fixture with consistent percentiles', () => {
    const raws = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    const issues = raws.map((raw: unknown) => transformIssueForKpi(raw as JiraIssue));
    const results = backlogAgePercentilesPlugin.calculate(makeContext(issues, new Date()));

    expect(results).toHaveLength(3);
    const [p50, p90, oldest] = results;
    expect(p50.value).toBeLessThanOrEqual(p90.value);
    expect(p90.value).toBeLessThanOrEqual(oldest.value);

    for (const r of results) {
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(r.value)).toBe(true);
    }

    const openCounts = results.map((r) => r.details?.find((d) => d.label === 'Open Tickets')?.value);
    expect(new Set(openCounts).size).toBe(1);

    console.log(`  P50: ${p50.value}d | P90: ${p90.value}d | Oldest: ${oldest.value}d (${openCounts[0]} open tickets)`);
  });
});
