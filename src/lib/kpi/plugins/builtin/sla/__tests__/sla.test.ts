/**
 * SLA domain KPI plugin unit tests
 * Covers: sla_by_priority, sla_by_status, sla_compliance
 *
 * Dates use LOCAL components on weekdays (2024-01-02 is a Tuesday, non-holiday)
 * within 09:00-17:00 work hours so calculateBusinessHours is deterministic and
 * timezone-robust.
 */

import { describe, it, expect } from 'vitest';
import slaByPriorityPlugin from '../sla-by-priority';
import slaByStatusPlugin from '../sla-by-status';
import slaCompliancePlugin from '../sla-compliance';
import { createMockContext } from '../../../../__tests__/mocks';
import type { TransformedIssue, HolidayContext } from '../../../../types';

// local weekday timestamps within business hours
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

function holidaysWith(slaTargetHours?: number): HolidayContext {
  return {
    dates: new Set<string>(),
    regions: [],
    workStartHour: 9,
    workEndHour: 17,
    isHoliday: (_date: Date) => false,
    isWorkingDay: (_date: Date) => true,
    ...(slaTargetHours !== undefined ? { slaTargetHours } : {}),
  };
}

describe('sla_by_priority Plugin', () => {
  it('has correct metadata', () => {
    expect(slaByPriorityPlugin.id).toBe('sla_by_priority');
    expect(slaByPriorityPlugin.domain).toBe('sla');
    expect(slaByPriorityPlugin.visualization).toBe('pie');
    expect(slaByPriorityPlugin.unit).toBe('%');
  });

  it('groups resolved tickets by priority and computes within-SLA rate (incl. boundary, breach, fallback target)', () => {
    // Admin override targets: High=4h, Medium=8h, Low=24h
    const slaTargets = { High: 4, Medium: 8, Low: 24 };
    const issues = [
      // High: 2h (within admin target 4)
      makeIssue({ key: 'TEST-1', priority: 'High', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 11) }),
      // High: 4h exactly (boundary, within)
      makeIssue({ key: 'TEST-2', priority: 'High', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 13) }),
      // Medium: 12h (> admin target 8 => breach)
      makeIssue({ key: 'TEST-3', priority: 'Medium', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 3, 13) }),
      // Low: 12h (within admin target 24)
      makeIssue({ key: 'TEST-4', priority: 'Low', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 3, 13) }),
      // Critical: unknown priority -> fallback target 40h; 2h within
      makeIssue({ key: 'TEST-5', priority: 'Critical', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 11) }),
      // open ticket -> skipped
      makeIssue({ key: 'TEST-6', priority: 'High', created: D(2024, 0, 2, 9), resolved: null }),
    ];

    const context = createMockContext(0, { issues: issues as any, slaTargets });

    const results = slaByPriorityPlugin.calculate(context) as any[];

    // Sorted alphabetically by priority: Critical, High, Low, Medium
    expect(results.map((r) => r.name)).toEqual([
      'SLA: Critical',
      'SLA: High',
      'SLA: Low',
      'SLA: Medium',
    ]);

    const critical = results.find((r) => r.dimensions.priority === 'Critical')!;
    expect(critical.value).toBe(100);
    expect(critical.details).toContainEqual({ label: 'Target', value: 40, unit: 'hours' });
    expect(critical.details).toContainEqual({ label: 'Within SLA', value: 1 });
    expect(critical.details).toContainEqual({ label: 'Total', value: 1 });
    expect(critical.ticketKeys).toEqual(['TEST-5']);

    const high = results.find((r) => r.dimensions.priority === 'High')!;
    expect(high.value).toBe(100);
    expect(high.details).toContainEqual({ label: 'Target', value: 4, unit: 'hours' });
    expect(high.details).toContainEqual({ label: 'Within SLA', value: 2 });
    expect(high.details).toContainEqual({ label: 'Total', value: 2 });
    expect(high.ticketKeys).toEqual(['TEST-1', 'TEST-2']);

    const low = results.find((r) => r.dimensions.priority === 'Low')!;
    expect(low.value).toBe(100);
    expect(low.details).toContainEqual({ label: 'Target', value: 24, unit: 'hours' });

    const medium = results.find((r) => r.dimensions.priority === 'Medium')!;
    expect(medium.value).toBe(0); // 12h > 8h target
    expect(medium.details).toContainEqual({ label: 'Within SLA', value: 0 });
    expect(medium.details).toContainEqual({ label: 'Total', value: 1 });
    expect(medium.ticketKeys).toEqual(['TEST-3']);
  });

  it('returns empty array when no tickets are resolved', () => {
    const issues = [makeIssue({ key: 'TEST-1', priority: 'High', resolved: null })];
    const context = createMockContext(0, { issues: issues as any, slaTargets: { High: 4 } });
    expect(slaByPriorityPlugin.calculate(context)).toEqual([]);
  });
});

describe('sla_by_status Plugin', () => {
  // status-based SLA targets (status -> hours)
  const statusTargets = { 'In Progress': 8 };

  it('has correct metadata', () => {
    expect(slaByStatusPlugin.id).toBe('sla_by_status');
    expect(slaByStatusPlugin.domain).toBe('sla');
    expect(slaByStatusPlugin.unit).toBe('%');
  });

  it('computes within-SLA when a status duration is under the target', () => {
    const issues = [
      makeIssue({
        key: 'TEST-1',
        assignee: 'Alice',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 2, 13),
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 2, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 2, 13) },
        ],
        comments: [],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, slaTargets: statusTargets });
    const results = slaByStatusPlugin.calculate(context) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('SLA: In Progress');
    expect(results[0].value).toBe(100); // 4h <= 8h
    expect(results[0].ticketKeys).toEqual(['TEST-1']);
    expect(results[0].details).toContainEqual({ label: 'Target', value: 8, unit: 'hours' });
    expect(results[0].details).toContainEqual({ label: 'Within SLA', value: 1 });
    expect(results[0].details).toContainEqual({ label: 'Total Occurrences', value: 1 });
  });

  it('counts a breach when the status duration exceeds the target', () => {
    const issues = [
      makeIssue({
        key: 'TEST-1',
        assignee: 'Alice',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 3, 11),
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 2, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 3, 11) },
        ],
        comments: [],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, slaTargets: statusTargets });
    const results = slaByStatusPlugin.calculate(context) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0); // 10h > 8h
    expect(results[0].details).toContainEqual({ label: 'Within SLA', value: 0 });
    expect(results[0].details).toContainEqual({ label: 'Total Occurrences', value: 1 });
  });

  it('resets the SLA clock to the last assignee comment during the status window', () => {
    const issues = [
      makeIssue({
        key: 'TEST-1',
        assignee: 'Alice',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 3, 11), // would be 10h (breach) without comment reset
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 2, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 3, 11) },
        ],
        comments: [{ author: 'Alice', created: D(2024, 0, 2, 15) }], // resets start to 15:00 -> 4h
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, slaTargets: statusTargets });
    const results = slaByStatusPlugin.calculate(context) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(100); // 4h (15:00->17:00 + next day 09:00->11:00) <= 8h
  });

  it('ignores non-assignee comments unless useAnyoneCommentsForSla is set', () => {
    const baseIssue = () =>
      makeIssue({
        key: 'TEST-1',
        assignee: 'Alice',
        reporter: 'Carol',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 3, 11), // 10h baseline (breach)
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 2, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 3, 11) },
        ],
        comments: [{ author: 'Bob', created: D(2024, 0, 2, 15) }],
      });

    // default: only assignee comments count -> Bob ignored -> breach
    const ctxAssigneeOnly = createMockContext(0, {
      issues: [baseIssue()] as any,
      slaTargets: statusTargets,
      useAnyoneCommentsForSla: false,
    });
    const r1 = slaByStatusPlugin.calculate(ctxAssigneeOnly) as any[];
    expect(r1[0].value).toBe(0);

    // anyone mode: Bob's comment counts -> reset -> within
    const ctxAnyone = createMockContext(0, {
      issues: [baseIssue()] as any,
      slaTargets: statusTargets,
      useAnyoneCommentsForSla: true,
    });
    const r2 = slaByStatusPlugin.calculate(ctxAnyone) as any[];
    expect(r2[0].value).toBe(100);
  });

  it('also accounts for the initial status (before the first transition)', () => {
    const issues = [
      makeIssue({
        key: 'TEST-1',
        assignee: 'Alice',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 2, 13),
        transitions: [
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 2, 13) },
        ],
        comments: [],
      }),
    ];
    // 'In Progress' target so the initial-status branch is exercised
    const context = createMockContext(0, { issues: issues as any, slaTargets: { 'In Progress': 8 } });
    const results = slaByStatusPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('SLA: In Progress');
    expect(results[0].value).toBe(100); // created->13:00 = 4h <= 8h
    expect(results[0].ticketKeys).toEqual(['TEST-1']);
  });

  it('returns empty array when there are no SLA targets configured', () => {
    const issues = [makeIssue({ key: 'TEST-1' })];
    const context = createMockContext(0, { issues: issues as any, slaTargets: {} });
    expect(slaByStatusPlugin.calculate(context)).toEqual([]);
  });

  it('returns empty array when targets exist but no transitions match', () => {
    const issues = [makeIssue({ key: 'TEST-1' })];
    const context = createMockContext(0, { issues: issues as any, slaTargets: { Review: 4 } });
    expect(slaByStatusPlugin.calculate(context)).toEqual([]);
  });
});

describe('sla_compliance Plugin', () => {
  it('has correct metadata', () => {
    expect(slaCompliancePlugin.id).toBe('sla_compliance');
    expect(slaCompliancePlugin.domain).toBe('sla');
    expect(slaCompliancePlugin.unit).toBe('%');
  });

  it('computes overall within-SLA percentage across resolved tickets', () => {
    const slaTargetHours = 40;
    const issues = [
      // 2h -> within
      makeIssue({ key: 'TEST-1', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 11) }),
      // 12h -> within
      makeIssue({ key: 'TEST-2', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 3, 13) }),
      // ~44h (Jan2 09:00 -> Jan9 13:00) -> breach
      makeIssue({ key: 'TEST-3', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 9, 13) }),
      // open -> excluded from resolvedIssues
      makeIssue({ key: 'TEST-4', created: D(2024, 0, 2, 9), resolved: null }),
    ];

    const context = createMockContext(0, {
      issues: issues as any,
      holidays: holidaysWith(slaTargetHours),
    });

    const results = slaCompliancePlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('SLA Compliance Rate');
    expect(results[0].value).toBe(66.67); // 2 of 3
    expect(results[0].unit).toBe('%');
    expect(results[0].ticketKeys).toEqual(['TEST-1', 'TEST-2']);
    expect(results[0].details).toContainEqual({ label: 'Within SLA', value: 2, unit: 'tickets' });
    expect(results[0].details).toContainEqual({ label: 'Breached SLA', value: 1, unit: 'tickets' });
    expect(results[0].details).toContainEqual({ label: 'SLA Target', value: 40, unit: 'hours' });
  });

  it('returns zero when no tickets are resolved', () => {
    const issues = [makeIssue({ key: 'TEST-1', resolved: null })];
    const context = createMockContext(0, { issues: issues as any, holidays: holidaysWith(40) });
    const results = slaCompliancePlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].ticketKeys).toBeUndefined(); // early-return omits ticketKeys
  });

  it('defaults SLA target to 40 hours when not configured', () => {
    const issues = [makeIssue({ key: 'TEST-1', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 11) })];
    const context = createMockContext(0, { issues: issues as any, holidays: holidaysWith() });
    const results = slaCompliancePlugin.calculate(context) as any[];
    expect(results[0].value).toBe(100);
    expect(results[0].details).toContainEqual({ label: 'SLA Target', value: 40, unit: 'hours' });
  });
});
