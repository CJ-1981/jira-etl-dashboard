/**
 * Turnaround domain KPI plugin unit tests
 * Covers: time_in_status (builtin)
 *
 * Weekday dates in 2024-01 (Jan 2 = Tuesday) within business hours.
 * The "still in status" branch uses `new Date()` so the clock is pinned there.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import timeInStatusPlugin from '../time-in-status';
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

describe('time_in_status Plugin', () => {
  it('has correct metadata', () => {
    expect(timeInStatusPlugin.id).toBe('time_in_status');
    expect(timeInStatusPlugin.domain).toBe('turnaround');
    expect(timeInStatusPlugin.visualization).toBe('horizontal_bar');
    expect(timeInStatusPlugin.unit).toBe('hours');
  });

  it('averages business hours per status, accounting for the initial status and filtering transient (<1m) ones', () => {
    const issues = [
      makeIssue({
        key: 'TEST-1',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 2, 13),
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 2, 11) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 2, 13) },
        ],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = timeInStatusPlugin.calculate(context) as any[];

    // "Done" spent 0h (13:00 -> 13:00) -> filtered out as transient (< 1 minute avg)
    expect(results.map((r) => r.name)).toEqual(['Time in Open', 'Time in In Progress']);

    const open = results.find((r) => r.name === 'Time in Open')!;
    expect(open.value).toBe(2); // 09:00 -> 11:00
    expect(open.dimensions.status).toBe('Open');
    expect(open.ticketKeys).toEqual(['TEST-1']);
    expect(open.details).toContainEqual({ label: 'Total Occurrences', value: 1 });
    expect(open.details).toContainEqual({ label: 'Unique Issues', value: 1 });
    expect(open.details).toContainEqual({ label: 'Total Hours', value: 2 });

    const inProgress = results.find((r) => r.name === 'Time in In Progress')!;
    expect(inProgress.value).toBe(2); // 11:00 -> 13:00
    expect(inProgress.ticketKeys).toEqual(['TEST-1']);
  });

  it('returns empty array when there are no issues', () => {
    const context = createMockContext(0, { issues: [] as any });
    expect(timeInStatusPlugin.calculate(context)).toEqual([]);
  });

  it('returns empty array for resolved issues that have no transitions', () => {
    const issues = [
      makeIssue({ key: 'TEST-1', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 13), transitions: [] }),
    ];
    const context = createMockContext(0, { issues: issues as any });
    expect(timeInStatusPlugin.calculate(context)).toEqual([]);
  });

  describe('ongoing final status (uses new Date())', () => {
    const NOW = D(2024, 0, 15, 12); // Monday Jan 15
    beforeEach(() => {
      vi.useFakeTimers({ now: NOW });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('measures an unresolved ticket’s last status up to the current time', () => {
      const issues = [
        makeIssue({
          key: 'TEST-2',
          created: D(2024, 0, 2, 9),
          resolved: null,
          transitions: [
            { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 2, 11) },
          ],
        }),
      ];
      const context = createMockContext(0, { issues: issues as any });
      const results = timeInStatusPlugin.calculate(context) as any[];

      const open = results.find((r) => r.name === 'Time in Open')!;
      expect(open.value).toBe(2); // 09:00 -> 11:00

      // In Progress runs 11:00 (Jan 2) up to NOW (Jan 15 12:00) -> several business days
      const inProgress = results.find((r) => r.name === 'Time in In Progress')!;
      expect(inProgress.value).toBeGreaterThan(50);
      expect(inProgress.ticketKeys).toEqual(['TEST-2']);
    });
  });
});
