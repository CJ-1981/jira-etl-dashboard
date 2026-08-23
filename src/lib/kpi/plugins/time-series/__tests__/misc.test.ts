/**
 * Time-series KPI plugin unit tests (misc domains)
 * Covers: processing_time_trend (weekly), open_tickets_by_assignee_trend (weekly),
 *         time_in_status_trend_daily (daily)
 *
 * System clock pinned to mid-2024 (all Jan-2024 periods complete); a separate
 * case per plugin pins mid-range to exercise the incomplete-period branch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import avgProcessingHoursWeeklyPlugin from '../processing-time/avg-processing-hours-weekly';
import openTicketsByAssigneeWeeklyPlugin, {
  openTicketsByAssigneeDailyPlugin,
  openTicketsByAssigneeMonthlyPlugin,
} from '../assignee/open-tickets-by-assignee-weekly';
import timeInStatusDailyPlugin, {
  timeInStatusWeeklyPlugin,
  timeInStatusMonthlyPlugin,
} from '../turnaround/time-in-status-daily';
import { createMockContext } from '../../../__tests__/mocks';
import type { TransformedIssue } from '../../../types';

const D = (y: number, mo: number, d: number, h = 9, mi = 0) =>
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
    created: D(2024, 0, 9, 9),
    updated: D(2024, 0, 9, 9),
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

describe('processing_time_trend (weekly) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(avgProcessingHoursWeeklyPlugin.id).toBe('processing_time_trend');
    expect(avgProcessingHoursWeeklyPlugin.category).toBe('time-series');
    expect(avgProcessingHoursWeeklyPlugin.domain).toBe('processing-time');
    expect(avgProcessingHoursWeeklyPlugin.timeInterval).toBe('weekly');
    expect(avgProcessingHoursWeeklyPlugin.unit).toBe('hours');
  });

  it('averages processing hours per week and reports min/max over complete periods', () => {
    const issues = [
      // 2h, resolved Jan 9 (ISO W02)
      makeIssue({ key: 'P1', created: D(2024, 0, 9, 9), resolved: D(2024, 0, 9, 11), status: 'Done' }),
      // 4h, resolved Jan 16 (ISO W03)
      makeIssue({ key: 'P2', created: D(2024, 0, 16, 9), resolved: D(2024, 0, 16, 13), status: 'Done' }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = avgProcessingHoursWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.name).toBe('Avg. Processing Time');
    expect(r.value).toBe(3); // weighted (2*1 + 4*1) / 2
    expect(r.timeSeries).toHaveLength(4); // W02..W05
    expect(r.timeSeries.every((p: any) => p.isComplete === true)).toBe(true);
    expect(r.timeSeries.find((p: any) => p.value === 2 && p.count === 1)).toBeDefined();
    expect(r.timeSeries.find((p: any) => p.value === 4 && p.count === 1)).toBeDefined();

    expect(r.details).toContainEqual({ label: 'Complete Periods', value: 4 });
    expect(r.details).toContainEqual({ label: 'Total Resolved', value: 2 });
    expect(r.details).toContainEqual({ label: 'Min Time (Complete)', value: 2, unit: 'hours' });
    expect(r.details).toContainEqual({ label: 'Max Time (Complete)', value: 4, unit: 'hours' });
  });

  it('returns a single zero-value result with empty timeSeries when nothing is resolved', () => {
    const issues = [makeIssue({ key: 'OPEN', resolved: null, status: 'Open' })];
    const context = createMockContext(0, { issues: issues as any, period });
    const results = avgProcessingHoursWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].timeSeries).toEqual([]);
  });

  it('flags the incomplete current period and excludes it from the average', () => {
    vi.useFakeTimers({ now: D(2024, 0, 20, 12) }); // W03 incomplete
    const shortPeriod = { start: D(2024, 0, 15, 12), end: D(2024, 0, 21, 12) };
    const issues = [
      // 12h, resolved Jan 17 (W03, incomplete)
      makeIssue({ key: 'LATE', created: D(2024, 0, 16, 9), resolved: D(2024, 0, 17, 13), status: 'Done' }),
    ];
    const context = createMockContext(0, { issues: issues as any, period: shortPeriod });
    const results = avgProcessingHoursWeeklyPlugin.calculate(context) as any[];
    const r = results[0];
    expect(r.timeSeries).toHaveLength(1);
    expect(r.timeSeries[0].isComplete).toBe(false);
    expect(r.timeSeries[0].value).toBe(12);
    expect(r.value).toBe(0); // no complete periods
    expect(r.details?.some((d: any) => String(d.label).includes('incomplete'))).toBe(true);
  });
});

describe('open_tickets_by_assignee_trend (weekly) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(openTicketsByAssigneeWeeklyPlugin.id).toBe('open_tickets_by_assignee_trend');
    expect(openTicketsByAssigneeWeeklyPlugin.category).toBe('time-series');
    expect(openTicketsByAssigneeWeeklyPlugin.domain).toBe('assignee');
    expect(openTicketsByAssigneeWeeklyPlugin.timeInterval).toBe('weekly');
    expect(openTicketsByAssigneeWeeklyPlugin.unit).toBe('tickets');
  });

  it('counts open tickets per assignee at the end of each week', () => {
    const issues = [
      // Alice: open forever (created Jan 2)
      makeIssue({ key: 'A1', assignee: 'Alice', created: D(2024, 0, 2, 12), status: 'Open', resolved: null }),
      // Alice: open only until resolved (Jan 20) -> open at W02 end only
      makeIssue({ key: 'A2', assignee: 'Alice', created: D(2024, 0, 10, 12), resolved: D(2024, 0, 20, 12), status: 'Done', statusCategory: 'Done' }),
      // Bob: open forever (created Jan 5)
      makeIssue({ key: 'B1', assignee: 'Bob', created: D(2024, 0, 5, 12), status: 'Open', resolved: null }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = openTicketsByAssigneeWeeklyPlugin.calculate(context) as any[];
    expect(results.map((r) => r.name).sort()).toEqual(['Open Tickets: Alice', 'Open Tickets: Bob']);

    const alice = results.find((r) => r.dimensions.assignee === 'Alice')!;
    expect(alice.timeSeries).toHaveLength(5); // W01..W05
    expect(alice.timeSeries.every((p: any) => p.isComplete === true)).toBe(true);
    // At W02 end both A1 and A2 are open -> value 2
    expect(alice.timeSeries.find((p: any) => p.value === 2)).toBeDefined();
    // Current value (last complete period) -> only A1 still open
    expect(alice.value).toBe(1);
    expect(alice.ticketKeys).toEqual(['A1']);

    const bob = results.find((r) => r.dimensions.assignee === 'Bob')!;
    expect(bob.value).toBe(1);
    expect(bob.ticketKeys).toEqual(['B1']);
  });

  it('returns a single zero-value result with empty timeSeries when there are no issues', () => {
    const context = createMockContext(0, { issues: [] as any, period });
    const results = openTicketsByAssigneeWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].timeSeries).toEqual([]);
  });

  it('uses the last complete period for the current value and flags incompleteness', () => {
    // now = Jan 20 -> W03+ incomplete; last complete period is W02 (ends Jan 14)
    vi.useFakeTimers({ now: D(2024, 0, 20, 12) });
    const issues = [
      makeIssue({ key: 'A1', assignee: 'Alice', created: D(2024, 0, 2, 12), status: 'Open', resolved: null }),
      makeIssue({ key: 'A2', assignee: 'Alice', created: D(2024, 0, 10, 12), resolved: D(2024, 0, 20, 12), status: 'Done', statusCategory: 'Done' }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = openTicketsByAssigneeWeeklyPlugin.calculate(context) as any[];
    const alice = results[0];
    // At W02 end (last complete period) both A1 and A2 are open
    expect(alice.value).toBe(2);
    expect(alice.ticketKeys).toEqual(['A1', 'A2']);
    // Incomplete periods are flagged
    expect(alice.timeSeries.some((p: any) => p.isComplete === false)).toBe(true);
    expect(alice.details?.some((d: any) => String(d.label).includes('incomplete'))).toBe(true);
  });
});

describe('time_in_status_trend_daily (daily) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(timeInStatusDailyPlugin.id).toBe('time_in_status_trend_daily');
    expect(timeInStatusDailyPlugin.category).toBe('time-series');
    expect(timeInStatusDailyPlugin.domain).toBe('turnaround');
    expect(timeInStatusDailyPlugin.timeInterval).toBe('daily');
    expect(timeInStatusDailyPlugin.unit).toBe('hours');
  });

  it('averages time in each status per day, one result line per status', () => {
    const issues = [
      // resolved Jan 9: In Progress 1.5h, Done 0h
      makeIssue({
        key: 'D1',
        created: D(2024, 0, 9, 9),
        resolved: D(2024, 0, 9, 11),
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 9, 9, 30) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 9, 11) },
        ],
      }),
      // resolved Jan 10: Review 4h, Done 0h
      makeIssue({
        key: 'D2',
        created: D(2024, 0, 10, 9),
        resolved: D(2024, 0, 10, 13),
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'Review', author: 'x', occurredAt: D(2024, 0, 10, 9) },
          { fromStatus: 'Review', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 10, 13) },
        ],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = timeInStatusDailyPlugin.calculate(context) as any[];
    expect(results.map((r) => r.name).sort()).toEqual(['Time in Done', 'Time in In Progress', 'Time in Review']);

    const inProgress = results.find((r) => r.dimensions.status === 'In Progress')!;
    expect(inProgress.value).toBe(1.5); // only Jan 9 had data

    const review = results.find((r) => r.dimensions.status === 'Review')!;
    expect(review.value).toBe(4); // only Jan 10 had data

    const done = results.find((r) => r.dimensions.status === 'Done')!;
    expect(done.value).toBe(0); // 0h on both days

    // 23 daily periods enumerated (Jan 9 .. Jan 31)
    for (const r of results) {
      expect(r.timeSeries).toHaveLength(23);
      expect(r.timeSeries.every((p: any) => p.isComplete === true)).toBe(true);
    }
  });

  it('returns a single zero-value result with empty timeSeries when nothing is resolved', () => {
    const issues = [makeIssue({ key: 'OPEN', resolved: null, status: 'Open' })];
    const context = createMockContext(0, { issues: issues as any, period });
    const results = timeInStatusDailyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].timeSeries).toEqual([]);
  });

  it('flags the incomplete current period on the first status result', () => {
    // now = Jan 20 12:00 -> the Jan 20 daily period is incomplete
    vi.useFakeTimers({ now: D(2024, 0, 20, 12) });
    const shortPeriod = { start: D(2024, 0, 20, 12), end: D(2024, 0, 20, 23, 59) };
    const issues = [
      makeIssue({
        key: 'D1',
        created: D(2024, 0, 20, 9),
        resolved: D(2024, 0, 20, 11),
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 20, 9, 30) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 20, 11) },
        ],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, period: shortPeriod });

    const results = timeInStatusDailyPlugin.calculate(context) as any[];
    expect(results.length).toBeGreaterThan(0);
    // The Jan 20 period is incomplete
    expect(results[0].timeSeries.some((p: any) => p.isComplete === false)).toBe(true);
    // No complete periods with data -> overall 0
    expect(results[0].value).toBe(0);
    // Partial-period info is attached to the first status result
    expect(results[0].details?.some((d: any) => String(d.label).includes('incomplete'))).toBe(true);
  });
});

describe('interval variants (plugin factory)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('assignee daily/monthly variants expose correct metadata and bucket by interval', () => {
    expect(openTicketsByAssigneeDailyPlugin.id).toBe('open_tickets_by_assignee_trend_daily');
    expect(openTicketsByAssigneeDailyPlugin.timeInterval).toBe('daily');
    expect(openTicketsByAssigneeMonthlyPlugin.id).toBe('open_tickets_by_assignee_trend_monthly');
    expect(openTicketsByAssigneeMonthlyPlugin.timeInterval).toBe('monthly');

    const issues = [
      makeIssue({ key: 'A1', assignee: 'Alice', created: D(2024, 0, 2, 12), status: 'Open', resolved: null }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    // Monthly: a single 2024-01 bucket, ticket still open at month end
    const monthly = openTicketsByAssigneeMonthlyPlugin.calculate(context) as any[];
    expect(monthly).toHaveLength(1);
    expect(monthly[0].timeSeries).toHaveLength(1);
    expect(monthly[0].timeSeries[0].period).toBe('2024-01');
    expect(monthly[0].timeSeries[0].value).toBe(1);

    // Daily: one bucket per day across the period (Jan 1 .. Jan 31)
    const daily = openTicketsByAssigneeDailyPlugin.calculate(context) as any[];
    expect(daily).toHaveLength(1);
    expect(daily[0].timeSeries).toHaveLength(31);
    expect(daily[0].timeSeries[daily[0].timeSeries.length - 1].value).toBe(1);
  });

  it('time-in-status weekly/monthly variants expose correct metadata and bucket by interval', () => {
    expect(timeInStatusWeeklyPlugin.id).toBe('time_in_status_trend_weekly');
    expect(timeInStatusWeeklyPlugin.timeInterval).toBe('weekly');
    expect(timeInStatusMonthlyPlugin.id).toBe('time_in_status_trend_monthly');
    expect(timeInStatusMonthlyPlugin.timeInterval).toBe('monthly');

    const issues = [
      makeIssue({
        key: 'D1',
        created: D(2024, 0, 9, 9),
        resolved: D(2024, 0, 9, 11),
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 9, 9, 30) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 9, 11) },
        ],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    // Monthly: a single 2024-01 bucket per status
    const monthly = timeInStatusMonthlyPlugin.calculate(context) as any[];
    const inProgress = monthly.find((r: any) => r.dimensions.status === 'In Progress');
    expect(inProgress).toBeDefined();
    expect(inProgress.timeSeries).toHaveLength(1);
    expect(inProgress.timeSeries[0].period).toBe('2024-01');
    expect(inProgress.timeSeries[0].value).toBe(1.5);
  });
});
