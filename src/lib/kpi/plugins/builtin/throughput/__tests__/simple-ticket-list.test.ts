import { describe, it, expect } from 'vitest';
import simpleTicketListPlugin from '../simple-ticket-list';
import type { KpiResult, TransformedIssue } from '../../../../types';

function makeIssue(partial: Partial<TransformedIssue> & { key: string }): TransformedIssue {
  return {
    project: 'TEST',
    summary: `Summary ${partial.key}`,
    issueType: 'Task',
    priority: 'Medium',
    status: 'Open',
    statusCategory: 'In Progress',
    assignee: 'Alice',
    reporter: 'reporter@example.com',
    issueOwnerTeam: null,
    created: new Date(2024, 0, 2, 9),
    updated: new Date(2024, 0, 2, 9),
    resolved: null,
    dueDate: null,
    storyPoints: null,
    labels: [],
    components: [],
    transitions: [],
    timeInStatus: {},
    comments: [],
    ...partial,
  } as TransformedIssue;
}

function makeContext(issues: TransformedIssue[]) {
  return {
    issues,
    holidays: {
      dates: new Set<string>(),
      regions: [],
      workStartHour: 9,
      workEndHour: 17,
      isHoliday: () => false,
      isWorkingDay: () => true,
    },
    period: { start: new Date(2024, 0, 1), end: new Date(2024, 2, 31) },
  };
}

describe('simple_ticket_list plugin', () => {
  it('emits one result carrying every in-scope ticket key', () => {
    const issues = [
      makeIssue({ key: 'T-1', created: new Date(2024, 0, 2) }),
      makeIssue({ key: 'T-2', created: new Date(2024, 0, 5) }),
      makeIssue({ key: 'T-3', created: new Date(2024, 0, 9) }),
    ];

    const results = simpleTicketListPlugin.calculate(makeContext(issues)) as KpiResult[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Tickets in Scope');
    expect(results[0].value).toBe(3);
    expect(results[0].unit).toBe('tickets');
    expect(results[0].ticketKeys).toEqual(['T-3', 'T-2', 'T-1']);
    expect(results[0].dimensions).toEqual({ scope: 'all' });
  });

  it('sorts newest first regardless of input order', () => {
    const issues = [
      makeIssue({ key: 'OLD', created: new Date(2023, 11, 1) }),
      makeIssue({ key: 'NEW', created: new Date(2024, 1, 1) }),
      makeIssue({ key: 'MID', created: new Date(2024, 0, 15) }),
    ];

    const results = simpleTicketListPlugin.calculate(makeContext(issues)) as KpiResult[];
    expect(results[0].ticketKeys).toEqual(['NEW', 'MID', 'OLD']);
  });

  it('returns an empty list when no issues are in scope', () => {
    const results = simpleTicketListPlugin.calculate(makeContext([])) as KpiResult[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].ticketKeys).toEqual([]);
  });
});
