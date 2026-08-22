/**
 * Time-series throughput KPI plugin unit tests
 * Covers: cumulative_flow_trend (daily), throughput_trend (weekly)
 *
 * The system clock is pinned to mid-2024 so all Jan-2024 periods are "complete".
 * A separate case pins the clock mid-range to exercise the incomplete-period branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import cumulativeFlowDailyPlugin from '../throughput/cumulative-flow-daily';
import throughputWeeklyPlugin from '../throughput/throughput-weekly';
import { createMockContext } from '../../../__tests__/mocks';
import type { TransformedIssue } from '../../../types';

const D = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  new Date(y, mo, d, h, mi, 0, 0);

function makeIssue(partial: Partial<TransformedIssue> & { key: string }): any {
  return {
    project: 'TEST',
    summary: 'Test issue',
    issueType: 'Task',
    priority: 'Medium',
    status: 'Open',
    statusCategory: 'In Progress',
    assignee: 'Unassigned',
    reporter: 'reporter@example.com',
    issueOwnerTeam: null,
    created: D(2024, 0, 2, 12),
    updated: D(2024, 0, 2, 12),
    resolved: null,
    dueDate: null,
    storyPoints: null,
    labels: [],
    components: [],
    transitions: [],
    timeInStatus: {},
    comments: [],
    ...partial,
  };
}

const period = { start: D(2024, 0, 1, 12), end: D(2024, 0, 31, 12) };

describe('cumulative_flow_trend (daily) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) }); // mid-2024 -> all Jan periods complete
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(cumulativeFlowDailyPlugin.id).toBe('cumulative_flow_trend');
    expect(cumulativeFlowDailyPlugin.category).toBe('time-series');
    expect(cumulativeFlowDailyPlugin.domain).toBe('throughput');
    expect(cumulativeFlowDailyPlugin.timeInterval).toBe('daily');
    expect(cumulativeFlowDailyPlugin.unit).toBe('tickets');
  });

  it('builds one time-series per status over the daily periods (incl. transitions + Infinity end)', () => {
    const issues = [
      // Open forever
      makeIssue({ key: 'OPEN', status: 'Open', statusCategory: 'To Do', created: D(2024, 0, 2, 12) }),
      // Done forever
      makeIssue({ key: 'DONE', status: 'Done', statusCategory: 'Done', created: D(2024, 0, 2, 12) }),
      // Open -> In Progress on Jan 5
      makeIssue({
        key: 'PROG',
        status: 'In Progress',
        statusCategory: 'In Progress',
        created: D(2024, 0, 2, 12),
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 5, 12) },
        ],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = cumulativeFlowDailyPlugin.calculate(context) as any[];

    expect(results.map((r) => r.name).sort()).toEqual(['Done', 'In Progress', 'Open']);
    for (const r of results) {
      expect(r.unit).toBe('tickets');
      expect(r.timeSeries).toHaveLength(31);
      expect(r.timeSeries.every((p: any) => p.isComplete === true)).toBe(true);
      expect(r.value).toBe(1); // each status still has >=1 ticket at the last (complete) period
    }
    // Each point is well-formed
    const sample = results[0].timeSeries[0];
    expect(sample).toHaveProperty('period');
    expect(sample).toHaveProperty('date');
    expect(sample).toHaveProperty('value');
    expect(sample).toHaveProperty('count');
    expect(sample).toHaveProperty('isComplete');
  });

  it('returns an empty array when there are no issues (no statuses)', () => {
    const context = createMockContext(0, { issues: [] as any, period });
    expect(cumulativeFlowDailyPlugin.calculate(context)).toEqual([]);
  });
});

describe('throughput_trend (weekly) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(throughputWeeklyPlugin.id).toBe('throughput_trend');
    expect(throughputWeeklyPlugin.category).toBe('time-series');
    expect(throughputWeeklyPlugin.domain).toBe('throughput');
    expect(throughputWeeklyPlugin.timeInterval).toBe('weekly');
    expect(throughputWeeklyPlugin.unit).toBe('tickets');
  });

  it('groups resolved tickets per week, fills zero-periods, and averages over complete periods', () => {
    // R1 resolved Jan 10 (Wed, ISO W02), R2 & R3 resolved Jan 17 (Wed, ISO W03)
    const issues = [
      makeIssue({ key: 'R1', created: D(2024, 0, 9, 9), resolved: D(2024, 0, 10, 12), status: 'Done' }),
      makeIssue({ key: 'R2', created: D(2024, 0, 16, 9), resolved: D(2024, 0, 17, 12), status: 'Done' }),
      makeIssue({ key: 'R3', created: D(2024, 0, 16, 9), resolved: D(2024, 0, 17, 12), status: 'Done' }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = throughputWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);

    const r = results[0];
    expect(r.name).toBe('Throughput');
    expect(r.unit).toBe('tickets/period');
    // 4 weeks enumerated (W02..W05)
    expect(r.timeSeries).toHaveLength(4);
    expect(r.timeSeries.every((p: any) => p.isComplete === true)).toBe(true);

    // One week with 2 resolved, one with 1, two with 0
    expect(r.timeSeries.find((p: any) => p.value === 2 && p.count === 2)).toBeDefined();
    expect(r.timeSeries.find((p: any) => p.value === 1 && p.count === 1)).toBeDefined();
    expect(r.timeSeries.filter((p: any) => p.value === 0)).toHaveLength(2);

    // overall avg = 3 resolved / 4 complete periods = 0.75
    expect(r.value).toBe(0.75);
    expect(r.details).toContainEqual({ label: 'Complete Periods', value: 4 });
    expect(r.details).toContainEqual({ label: 'Total Resolved', value: 3 });
    expect(r.details).toContainEqual({ label: 'Avg Throughput (Complete)', value: 0.75, unit: 'tickets/period' });
    expect(r.details).toContainEqual({ label: 'Peak Period (Complete)', value: 2, unit: 'tickets' });
  });

  it('returns a single zero-value result with empty timeSeries when nothing is resolved', () => {
    const issues = [makeIssue({ key: 'OPEN', resolved: null, status: 'Open' })];
    const context = createMockContext(0, { issues: issues as any, period });
    const results = throughputWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].timeSeries).toEqual([]);
  });

  it('flags the current (incomplete) period and excludes it from the average', () => {
    // Pin clock to Jan 20 2024 (Sat) so the week containing Jan 17 (W03) is still incomplete
    vi.useFakeTimers({ now: D(2024, 0, 20, 12) });
    const issues = [
      makeIssue({ key: 'R1', created: D(2024, 0, 16, 9), resolved: D(2024, 0, 17, 12), status: 'Done' }),
    ];
    const shortPeriod = { start: D(2024, 0, 15, 12), end: D(2024, 0, 21, 12) };
    const context = createMockContext(0, { issues: issues as any, period: shortPeriod });

    const results = throughputWeeklyPlugin.calculate(context) as any[];
    const r = results[0];

    // The single period (W03) is incomplete
    expect(r.timeSeries).toHaveLength(1);
    expect(r.timeSeries[0].isComplete).toBe(false);
    expect(r.timeSeries[0].value).toBe(1);

    // No complete periods -> average 0; partial-period info is surfaced
    expect(r.value).toBe(0);
    expect(r.details?.some((d: any) => String(d.label).includes('incomplete'))).toBe(true);
  });
});
