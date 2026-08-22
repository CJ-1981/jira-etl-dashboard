/**
 * Throughput domain builtin KPI plugin unit tests
 * Covers: throughput, weekly_ticket_list
 *
 * weekly_ticket_list derives week boundaries from `new Date()`, so the system
 * clock is pinned for those tests.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import throughputPlugin from '../throughput';
import weeklyTicketListPlugin from '../weekly-ticket-list';
import { createMockContext } from '../../../../__tests__/mocks';
import type { TransformedIssue } from '../../../../types';

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
    created: D(2024, 0, 2, 9),
    updated: D(2024, 0, 2, 9),
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

describe('throughput Plugin', () => {
  const period = {
    start: D(2024, 0, 1, 0, 0),
    end: D(2024, 0, 31, 23, 59),
  };

  it('has correct metadata', () => {
    expect(throughputPlugin.id).toBe('throughput');
    expect(throughputPlugin.domain).toBe('throughput');
    expect(throughputPlugin.visualization).toBe('card');
    expect(throughputPlugin.unit).toBe('tickets');
  });

  it('counts created, resolved, and still-open tickets within the period', () => {
    const issues = [
      // A: created & resolved inside the period
      makeIssue({ key: 'A', created: D(2024, 0, 10, 9), resolved: D(2024, 0, 15, 9), status: 'Done', statusCategory: 'Done' }),
      // B: created before period, still open -> open (not created/resolved this period)
      makeIssue({ key: 'B', created: D(2023, 11, 1, 9), resolved: null, status: 'Open' }),
      // C: created in period, resolved AFTER period end -> open at period end
      makeIssue({ key: 'C', created: D(2024, 0, 20, 9), resolved: D(2024, 1, 15, 9), status: 'Done', statusCategory: 'Done' }),
      // D: created & resolved inside the period
      makeIssue({ key: 'D', created: D(2024, 0, 5, 9), resolved: D(2024, 0, 10, 9), status: 'Done', statusCategory: 'Done' }),
      // E: created in period, never resolved -> open
      makeIssue({ key: 'E', created: D(2024, 0, 25, 9), resolved: null, status: 'Open' }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = throughputPlugin.calculate(context) as any[];

    expect(results).toHaveLength(3);
    const byName = (n: string) => results.find((r) => r.name === n)!;

    expect(byName('Resolved Tickets').value).toBe(2);
    expect(byName('Resolved Tickets').ticketKeys).toEqual(['A', 'D']);
    expect(byName('Resolved Tickets').details).toContainEqual({
      label: 'Avg. Resolved/Day',
      value: 0.06, // 2 resolved / 31 days (ceil of ~31-day period)
      unit: 'tickets/day',
    });

    expect(byName('Created Tickets').value).toBe(4);
    expect(byName('Created Tickets').ticketKeys).toEqual(['A', 'C', 'D', 'E']);

    expect(byName('Open Tickets').value).toBe(3);
    expect(byName('Open Tickets').ticketKeys).toEqual(['B', 'C', 'E']);
  });

  it('returns zero counts for empty issues', () => {
    const context = createMockContext(0, { issues: [] as any, period });
    const results = throughputPlugin.calculate(context) as any[];
    expect(results).toHaveLength(3);
    expect(results.every((r) => r.value === 0)).toBe(true);
  });

  it('treats a Done-status ticket with no resolution date as not open', () => {
    // created in period, no resolutiondate, status Done -> isIssueDone true -> not open
    const issues = [makeIssue({ key: 'A', created: D(2024, 0, 5, 9), resolved: null, status: 'Done', statusCategory: 'Done' })];
    const context = createMockContext(0, { issues: issues as any, period });
    const results = throughputPlugin.calculate(context) as any[];
    const open = results.find((r) => r.name === 'Open Tickets')!;
    expect(open.value).toBe(0);
    expect(results.find((r) => r.name === 'Created Tickets')!.value).toBe(1);
  });
});

describe('weekly_ticket_list Plugin', () => {
  // Pin the clock to Thursday 2024-01-04 12:00 -> this week = Jan 1-7, last week = Dec 25-31
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 0, 4, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(weeklyTicketListPlugin.id).toBe('weekly_ticket_list');
    expect(weeklyTicketListPlugin.domain).toBe('throughput');
    expect(weeklyTicketListPlugin.visualization).toBe('list');
  });

  it('groups opened/closed tickets for this week and last week, sorted by priority', () => {
    const issues = [
      // this week opened (2 issues, to verify priority sort)
      makeIssue({ key: 'TW-LOW', created: D(2024, 0, 2, 9), priority: 'Low' }),
      makeIssue({ key: 'TW-HIGH', created: D(2024, 0, 3, 9), priority: 'High' }),
      // this week closed
      makeIssue({ key: 'TW-CLOSED', created: D(2023, 11, 20, 9), resolved: D(2024, 0, 3, 9), priority: 'Medium', status: 'Done' }),
      // last week opened
      makeIssue({ key: 'LW-OPENED', created: D(2023, 11, 27, 9), priority: 'Highest' }),
      // last week closed
      makeIssue({ key: 'LW-CLOSED', created: D(2023, 11, 20, 9), resolved: D(2023, 11, 28, 9), priority: 'Low', status: 'Done' }),
    ];
    const context = createMockContext(0, { issues: issues as any });

    const results = weeklyTicketListPlugin.calculate(context) as any[];
    expect(results).toHaveLength(4);

    const byDim = (week: string, activity: string) =>
      results.find((r) => r.dimensions.week === week && r.dimensions.activity === activity)!;

    // This Week Opened: sorted by priority asc -> High before Low
    const two = byDim('this_week', 'opened');
    expect(two.value).toBe(2);
    expect(two.ticketKeys).toEqual(['TW-HIGH', 'TW-LOW']);

    const twc = byDim('this_week', 'closed');
    expect(twc.value).toBe(1);
    expect(twc.ticketKeys).toEqual(['TW-CLOSED']);

    const lwo = byDim('last_week', 'opened');
    expect(lwo.value).toBe(1);
    expect(lwo.ticketKeys).toEqual(['LW-OPENED']);

    const lwc = byDim('last_week', 'closed');
    expect(lwc.value).toBe(1);
    expect(lwc.ticketKeys).toEqual(['LW-CLOSED']);
  });

  it('returns four zero-value groups when no issues fall in either week', () => {
    // issues all created/closed well outside this & last week
    const issues = [
      makeIssue({ key: 'OLD', created: D(2023, 10, 1, 9), resolved: D(2023, 10, 2, 9), status: 'Done' }),
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = weeklyTicketListPlugin.calculate(context) as any[];
    expect(results).toHaveLength(4);
    expect(results.every((r) => r.value === 0)).toBe(true);
  });
});
