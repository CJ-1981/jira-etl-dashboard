/**
 * Assignee domain KPI plugin unit tests
 * Covers: open_tickets_by_assignee (builtin)
 */

import { describe, it, expect } from 'vitest';
import openTicketsByAssigneePlugin from '../open-tickets-by-assignee';
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

describe('open_tickets_by_assignee Plugin', () => {
  // reference date for age categorization = period.end (Jan 31 2024)
  const period = { start: D(2024, 0, 1, 0, 0), end: D(2024, 0, 31, 12, 0) };

  it('has correct metadata', () => {
    expect(openTicketsByAssigneePlugin.id).toBe('open_tickets_by_assignee');
    expect(openTicketsByAssigneePlugin.domain).toBe('assignee');
    expect(openTicketsByAssigneePlugin.visualization).toBe('horizontal_bar');
    expect(openTicketsByAssigneePlugin.unit).toBe('tickets');
  });

  it('groups open tickets by assignee and age category, sorted by total desc then age', () => {
    const issues = [
      // Alice this_week (created Jan 30 -> 1 day old at Jan 31)
      makeIssue({ key: 'A-TW', assignee: 'Alice', created: D(2024, 0, 30, 9), status: 'Open', resolved: null }),
      // Alice last_week (created Jan 22 -> ~9 days -> 1 week old)
      makeIssue({ key: 'A-LW', assignee: 'Alice', created: D(2024, 0, 22, 9), status: 'Open', resolved: null }),
      // Bob existing (created Jan 2 -> ~4 weeks old)
      makeIssue({ key: 'B-EX', assignee: 'Bob', created: D(2024, 0, 2, 9), status: 'Open', resolved: null }),
      // Bob done -> excluded
      makeIssue({ key: 'B-DONE', assignee: 'Bob', created: D(2024, 0, 2, 9), status: 'Done', statusCategory: 'Done', resolved: D(2024, 0, 5, 9) }),
      // unassigned assignee falls back to "Unassigned" bucket
      makeIssue({ key: 'U-EX', assignee: '', created: D(2024, 0, 2, 9), status: 'Open', resolved: null }),
    ];
    const context = createMockContext(0, { issues: issues as any, period });

    const results = openTicketsByAssigneePlugin.calculate(context) as any[];

    // Alice total(2) > Bob total(1) == Unassigned total(1); Bob sorts before Unassigned by name
    expect(results.map((r) => r.name)).toEqual([
      'Assignee: Alice (Last Week)',
      'Assignee: Alice (This Week)',
      'Assignee: Bob (Existing)',
      'Assignee: Unassigned (Existing)',
    ]);

    const aliceLw = results.find((r) => r.dimensions.assignee === 'Alice' && r.dimensions.ageCategory === 'last_week')!;
    expect(aliceLw.value).toBe(1);
    expect(aliceLw.ticketKeys).toEqual(['A-LW']);

    const aliceTw = results.find((r) => r.dimensions.assignee === 'Alice' && r.dimensions.ageCategory === 'this_week')!;
    expect(aliceTw.value).toBe(1);
    expect(aliceTw.ticketKeys).toEqual(['A-TW']);

    const bobEx = results.find((r) => r.dimensions.assignee === 'Bob' && r.dimensions.ageCategory === 'existing')!;
    expect(bobEx.value).toBe(1);
    expect(bobEx.ticketKeys).toEqual(['B-EX']);

    // DONE ticket never appears
    const allKeys = results.flatMap((r) => r.ticketKeys || []);
    expect(allKeys).not.toContain('B-DONE');
  });

  it('returns empty array when there are no open issues', () => {
    const issues = [makeIssue({ key: 'A', assignee: 'Alice', status: 'Done', statusCategory: 'Done', resolved: D(2024, 0, 5, 9) })];
    const context = createMockContext(0, { issues: issues as any, period });
    expect(openTicketsByAssigneePlugin.calculate(context)).toEqual([]);
  });

  it('returns empty array for no issues', () => {
    const context = createMockContext(0, { issues: [] as any, period });
    expect(openTicketsByAssigneePlugin.calculate(context)).toEqual([]);
  });
});
