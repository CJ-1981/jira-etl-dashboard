/**
 * Quality domain KPI plugin unit tests
 * Covers: reassignment_count, resolution_rate
 */

import { describe, it, expect } from 'vitest';
import reassignmentPlugin from '../reassignment';
import resolutionRatePlugin from '../resolution-rate';
import { createMockContext } from '../../../../__tests__/mocks';
import type { TransformedIssue } from '../../../../types';

// Local dates (weekdays, non-holiday) so business-hour math is deterministic.
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

describe('reassignment_count Plugin', () => {
  it('has correct metadata', () => {
    expect(reassignmentPlugin.id).toBe('reassignment_count');
    expect(reassignmentPlugin.domain).toBe('quality');
    expect(reassignmentPlugin.category).toBe('builtin');
    expect(reassignmentPlugin.unit).toBe('reassignments');
    expect(reassignmentPlugin.visualization).toBe('card');
  });

  it('counts assignee changes from raw changelog and averages across all issues', () => {
    const issues = [
      // 2 assignee reassignments
      makeIssue({
        key: 'TEST-1',
        changelog: {
          histories: [
            {
              items: [
                { field: 'assignee', from: 'Alice', to: 'Bob' },
                { field: 'assignee', from: 'Bob', to: 'Carol' },
                { field: 'status', from: 'Open', to: 'In Progress' },
              ],
            },
          ],
        },
      }),
      // 0 assignee reassignments (only status change)
      makeIssue({
        key: 'TEST-2',
        changelog: {
          histories: [
            { items: [{ field: 'status', from: 'Open', to: 'Done' }] },
          ],
        },
      }),
      // assignee item with empty from/to must NOT be counted
      makeIssue({
        key: 'TEST-3',
        changelog: {
          histories: [
            { items: [{ field: 'assignee', from: null, to: 'Alice' }] },
            { items: [{ field: 'assignee', from: 'Alice', to: null }] },
          ],
        },
      }),
      // no changelog at all
      makeIssue({ key: 'TEST-4' }),
    ];

    const context = createMockContext(0, { issues: issues as any });

    const results = reassignmentPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);

    const r = results[0];
    expect(r.name).toBe('Avg. Reassignments');
    expect(r.value).toBe(0.5); // 2 reassignments / 4 issues
    expect(r.unit).toBe('reassignments');
    expect(r.ticketKeys).toEqual(['TEST-1']);
    expect(r.details).toEqual([
      { label: 'Total Reassignments', value: 2 },
      { label: 'Issues with Reassignments', value: 1 },
    ]);
  });

  it('returns zero for empty issues', () => {
    const context = createMockContext(0, { issues: [] as any });
    const results = reassignmentPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].ticketKeys).toEqual([]);
    expect(results[0].details).toEqual([
      { label: 'Total Reassignments', value: 0 },
      { label: 'Issues with Reassignments', value: 0 },
    ]);
  });
});

describe('resolution_rate Plugin', () => {
  it('has correct metadata', () => {
    expect(resolutionRatePlugin.id).toBe('resolution_rate');
    expect(resolutionRatePlugin.domain).toBe('quality');
    expect(resolutionRatePlugin.unit).toBe('%');
  });

  it('counts resolved + status-done tickets as a percentage of total', () => {
    const issues = [
      // resolved via resolution date
      makeIssue({ key: 'TEST-1', resolved: D(2024, 0, 2, 11) }),
      // done via status name, no resolution date
      makeIssue({ key: 'TEST-2', status: 'Done', resolved: null }),
      // done via status 'Closed'
      makeIssue({ key: 'TEST-3', status: 'Closed', resolved: null }),
      // still open
      makeIssue({ key: 'TEST-4', status: 'Open', resolved: null }),
    ];

    const context = createMockContext(0, { issues: issues as any });
    const results = resolutionRatePlugin.calculate(context) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Resolution Rate');
    expect(results[0].value).toBe(75); // 3 of 4
    expect(results[0].unit).toBe('%');
    expect(results[0].ticketKeys).toEqual(['TEST-1', 'TEST-2', 'TEST-3']);
    expect(results[0].details).toEqual([
      { label: 'Resolved', value: 3 },
      { label: 'Open', value: 1 },
    ]);
  });

  it('returns zero rate with no ticketKeys when there are no issues', () => {
    const context = createMockContext(0, { issues: [] as any });
    const results = resolutionRatePlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].unit).toBe('%');
    expect(results[0].ticketKeys).toBeUndefined();
  });
});
