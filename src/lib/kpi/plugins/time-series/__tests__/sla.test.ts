/**
 * Time-series SLA KPI plugin unit tests
 * Covers: sla_by_status_trend (weekly), sla_by_status_excl_clone_trend (weekly),
 *         sla_trend (weekly compliance)
 *
 * System clock pinned to mid-2024 (all Jan-2024 periods complete); a separate
 * case pins mid-range to exercise the incomplete-period branch.
 * Local weekday timestamps (Jan 9 = Tue, Jan 16 = Tue, Jan 17 = Wed) within
 * 09:00-17:00 keep business-hour math deterministic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import slaByStatusWeeklyPlugin from '../sla/sla-by-status-weekly';
import slaByStatusExclCloneWeeklyPlugin from '../sla/sla-by-status-excl-clone-weekly';
import slaComplianceWeeklyPlugin from '../sla/sla-compliance-weekly';
import slaByStatusPlugin from '../../builtin/sla/sla-by-status';
import slaByStatusExclClonePlugin from '../../builtin/sla/sla-by-status-excl-clone';
import { createMockContext } from '../../../__tests__/mocks';
import type { TransformedIssue, HolidayContext } from '../../../types';

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

const period = { start: D(2024, 0, 1, 12), end: D(2024, 0, 31, 12) };
const statusTargets = { 'In Progress': 8 };

// Issue that was In Progress 4h (Jan 9 09:00 -> 13:00) -> within 8h target, resolved in ISO W02
const withinIssue = () =>
  makeIssue({
    key: 'MET',
    created: D(2024, 0, 9, 9),
    resolved: D(2024, 0, 9, 13),
    status: 'Done',
    statusCategory: 'Done',
    transitions: [
      { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 9, 9) },
      { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 9, 13) },
    ],
  });

// Issue that was In Progress 12h (Jan 16 09:00 -> Jan 17 13:00) -> breach of 8h target, resolved in ISO W03
const breachIssue = () =>
  makeIssue({
    key: 'BREACH',
    created: D(2024, 0, 16, 9),
    resolved: D(2024, 0, 17, 13),
    status: 'Done',
    statusCategory: 'Done',
    transitions: [
      { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 16, 9) },
      { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 17, 13) },
    ],
  });

describe('sla_by_status_trend (weekly) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(slaByStatusWeeklyPlugin.id).toBe('sla_by_status_trend');
    expect(slaByStatusWeeklyPlugin.category).toBe('time-series');
    expect(slaByStatusWeeklyPlugin.domain).toBe('sla');
    expect(slaByStatusWeeklyPlugin.timeInterval).toBe('weekly');
    expect(slaByStatusWeeklyPlugin.unit).toBe('%');
  });

  it('tracks per-status SLA compliance per week and weights the overall rate by occurrences', () => {
    const issues = [withinIssue(), breachIssue()];
    const context = createMockContext(0, { issues: issues as any, period, slaTargets: statusTargets });

    const results = slaByStatusWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);

    const r = results[0];
    expect(r.name).toBe('SLA Compliance - In Progress');
    expect(r.value).toBe(50); // (100*1 + 0*1) / 2
    expect(r.dimensions.status).toBe('In Progress');
    expect(r.timeSeries).toHaveLength(4); // W02..W05
    expect(r.timeSeries.every((p: any) => p.isComplete === true)).toBe(true);

    // met week (100, count 1) and breached week (0, count 1)
    expect(r.timeSeries.find((p: any) => p.value === 100 && p.count === 1)).toBeDefined();
    expect(r.timeSeries.find((p: any) => p.value === 0 && p.count === 1)).toBeDefined();

    expect(r.details).toContainEqual({ label: 'Target', value: 8, unit: 'hours' });
    expect(r.details).toContainEqual({ label: 'Total Occurrences', value: 2 });
    // Per-series target is exposed for chart reference-line rendering
    expect(r.slaTargetHours).toBe(8);
  });

  it('returns a single zero-value result when no SLA targets are configured', () => {
    const issues = [withinIssue()];
    const context = createMockContext(0, { issues: issues as any, period, slaTargets: {} });
    const results = slaByStatusWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].timeSeries).toEqual([]);
  });

  it('returns a single zero-value result when there are no issues', () => {
    const context = createMockContext(0, { issues: [] as any, period, slaTargets: statusTargets });
    const results = slaByStatusWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].timeSeries).toEqual([]);
  });

  it('flags the incomplete current period', () => {
    vi.useFakeTimers({ now: D(2024, 0, 20, 12) }); // Sat Jan 20 -> W03 (ends Jan 21) incomplete
    const shortPeriod = { start: D(2024, 0, 15, 12), end: D(2024, 0, 21, 12) };
    const issues = [withinIssue()]; // resolved Jan 9 (W02, complete)
    // Add a breach resolved Jan 17 (W03, incomplete)
    issues.push(breachIssue());
    const context = createMockContext(0, { issues: issues as any, period: shortPeriod, slaTargets: statusTargets });

    const results = slaByStatusWeeklyPlugin.calculate(context) as any[];
    const r = results[0];
    expect(r.timeSeries.some((p: any) => p.isComplete === false)).toBe(true);
    expect(r.details?.some((d: any) => String(d.label).includes('incomplete'))).toBe(true);
  });

  it('resets the SLA clock to the last assignee comment, matching the builtin card', () => {
    // In Progress for 12 business hours (Jan 16 09:00 -> Jan 17 13:00) -> breach of the 8h
    // target unless the assignee comment at Jan 17 10:00 resets the clock (then 3h -> met).
    const issues = [
      makeIssue({
        key: 'RESET',
        assignee: 'Alice',
        created: D(2024, 0, 16, 9),
        resolved: D(2024, 0, 17, 13),
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 16, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 17, 13) },
        ],
        comments: [{ author: 'Alice', created: D(2024, 0, 17, 10) }],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, period, slaTargets: statusTargets });

    // The builtin card honors the comment-based reset -> within SLA
    const cardResults = slaByStatusPlugin.calculate(context) as any[];
    expect(cardResults).toHaveLength(1);
    expect(cardResults[0].value).toBe(100);

    // The weekly trend bucket must use the same rules
    const results = slaByStatusWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.value).toBe(100);
    const week = r.timeSeries.find((p: any) => p.count === 1);
    expect(week).toBeDefined();
    expect(week.value).toBe(100);
  });
});

describe('sla_by_status_excl_clone_trend (weekly) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(slaByStatusExclCloneWeeklyPlugin.id).toBe('sla_by_status_excl_clone_trend');
    expect(slaByStatusExclCloneWeeklyPlugin.category).toBe('time-series');
    expect(slaByStatusExclCloneWeeklyPlugin.timeInterval).toBe('weekly');
  });

  it('excludes tickets whose summary contains "CLONE"', () => {
    const issues = [
      withinIssue(),
      breachIssue(),
      // clone of withinIssue -> would add a 2nd met occurrence in W02, but is excluded
      makeIssue({
        key: 'CLONE',
        summary: 'CLONE-123 fix',
        created: D(2024, 0, 9, 9),
        resolved: D(2024, 0, 9, 13),
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 9, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 9, 13) },
        ],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, period, slaTargets: statusTargets });

    const results = slaByStatusExclCloneWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    const r = results[0];

    // Only 2 occurrences (clone excluded) -> overall 50% (not 66.67%)
    expect(r.value).toBe(50);
    expect(r.details).toContainEqual({ label: 'Total Occurrences', value: 2 });

    // The met week has count 1 (not 2) -> confirms clone exclusion
    const metWeek = r.timeSeries.find((p: any) => p.value === 100 && p.count === 1);
    expect(metWeek).toBeDefined();
  });

  it('resets the SLA clock to the last assignee comment, matching the builtin excl-clone card', () => {
    // In Progress for 12 business hours (Jan 16 09:00 -> Jan 17 13:00) -> breach of the 8h
    // target unless the assignee comment at Jan 17 10:00 resets the clock (then 3h -> met).
    const issues = [
      makeIssue({
        key: 'RESET',
        assignee: 'Alice',
        created: D(2024, 0, 16, 9),
        resolved: D(2024, 0, 17, 13),
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 16, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 17, 13) },
        ],
        comments: [{ author: 'Alice', created: D(2024, 0, 17, 10) }],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any, period, slaTargets: statusTargets });

    // The builtin excl-clone card honors the comment-based reset -> within SLA
    const cardResults = slaByStatusExclClonePlugin.calculate(context) as any[];
    expect(cardResults).toHaveLength(1);
    expect(cardResults[0].value).toBe(100);

    // The weekly trend bucket must use the same rules
    const results = slaByStatusExclCloneWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.value).toBe(100);
    const week = r.timeSeries.find((p: any) => p.count === 1);
    expect(week).toBeDefined();
    expect(week.value).toBe(100);
  });

  it('applies useAnyoneCommentsForSla to the comment-based reset like the builtin card', () => {
    // Non-assignee comment at Jan 17 10:00; only counts when useAnyoneCommentsForSla is set.
    const resetIssue = () =>
      makeIssue({
        key: 'RESET',
        assignee: 'Alice',
        created: D(2024, 0, 16, 9),
        resolved: D(2024, 0, 17, 13), // 12 business hours -> breach without reset
        status: 'Done',
        statusCategory: 'Done',
        transitions: [
          { fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 16, 9) },
          { fromStatus: 'In Progress', toStatus: 'Done', author: 'x', occurredAt: D(2024, 0, 17, 13) },
        ],
        comments: [{ author: 'Bob', created: D(2024, 0, 17, 10) }],
      });

    // default: only assignee comments count -> Bob ignored -> breach
    const ctxAssigneeOnly = createMockContext(0, {
      issues: [resetIssue()] as any,
      period,
      slaTargets: statusTargets,
      useAnyoneCommentsForSla: false,
    });
    const r1 = (slaByStatusExclCloneWeeklyPlugin.calculate(ctxAssigneeOnly) as any[])[0];
    expect(r1.value).toBe(0);

    // anyone mode: Bob's comment resets the clock -> within SLA
    const ctxAnyone = createMockContext(0, {
      issues: [resetIssue()] as any,
      period,
      slaTargets: statusTargets,
      useAnyoneCommentsForSla: true,
    });
    const r2 = (slaByStatusExclCloneWeeklyPlugin.calculate(ctxAnyone) as any[])[0];
    expect(r2.value).toBe(100);
  });
});

describe('sla_trend (weekly compliance) Plugin', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: D(2024, 5, 15, 12) });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(slaComplianceWeeklyPlugin.id).toBe('sla_trend');
    expect(slaComplianceWeeklyPlugin.category).toBe('time-series');
    expect(slaComplianceWeeklyPlugin.domain).toBe('sla');
    expect(slaComplianceWeeklyPlugin.timeInterval).toBe('weekly');
    expect(slaComplianceWeeklyPlugin.unit).toBe('%');
  });

  it('computes per-week SLA compliance against the configured target hours', () => {
    const slaTargetHours = 40;
    const issues = [
      // 2h -> within (W02)
      makeIssue({ key: 'OK', created: D(2024, 0, 9, 9), resolved: D(2024, 0, 9, 11), status: 'Done' }),
      // ~52h -> breach (W03)
      makeIssue({ key: 'LATE', created: D(2024, 0, 9, 9), resolved: D(2024, 0, 17, 13), status: 'Done' }),
    ];
    const context = createMockContext(0, {
      issues: issues as any,
      period,
      holidays: holidaysWith(slaTargetHours),
    });

    const results = slaComplianceWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    const r = results[0];
    expect(r.name).toBe('SLA Compliance');
    expect(r.value).toBe(50); // (100*1 + 0*1) / 2
    expect(r.timeSeries).toHaveLength(4); // W02..W05
    expect(r.timeSeries.find((p: any) => p.value === 100 && p.count === 1)).toBeDefined();
    expect(r.timeSeries.find((p: any) => p.value === 0 && p.count === 1)).toBeDefined();

    expect(r.details).toContainEqual({ label: 'Complete Periods', value: 4 });
    expect(r.details).toContainEqual({ label: 'Total Resolved', value: 2 });
    expect(r.details).toContainEqual({ label: 'SLA Target', value: 40, unit: 'hours' });
    expect(r.details).toContainEqual({ label: 'Worst Period (Complete)', value: 0, unit: '%' });
    expect(r.details).toContainEqual({ label: 'Best Period (Complete)', value: 100, unit: '%' });
  });

  it('returns a single zero-value result with empty timeSeries when nothing is resolved', () => {
    const issues = [makeIssue({ key: 'OPEN', resolved: null, status: 'Open' })];
    const context = createMockContext(0, { issues: issues as any, period, holidays: holidaysWith(40) });
    const results = slaComplianceWeeklyPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
    expect(results[0].timeSeries).toEqual([]);
  });

  it('defaults the target to 40 hours when not configured', () => {
    const issues = [makeIssue({ key: 'OK', created: D(2024, 0, 9, 9), resolved: D(2024, 0, 9, 11), status: 'Done' })];
    const context = createMockContext(0, { issues: issues as any, period, holidays: holidaysWith() });
    const results = slaComplianceWeeklyPlugin.calculate(context) as any[];
    expect(results[0].value).toBe(100);
    expect(results[0].details).toContainEqual({ label: 'SLA Target', value: 40, unit: 'hours' });
  });

  it('flags the incomplete current period', () => {
    vi.useFakeTimers({ now: D(2024, 0, 20, 12) }); // W03 incomplete
    const shortPeriod = { start: D(2024, 0, 15, 12), end: D(2024, 0, 21, 12) };
    const issues = [makeIssue({ key: 'LATE', created: D(2024, 0, 16, 9), resolved: D(2024, 0, 17, 13), status: 'Done' })];
    const context = createMockContext(0, { issues: issues as any, period: shortPeriod, holidays: holidaysWith(40) });
    const results = slaComplianceWeeklyPlugin.calculate(context) as any[];
    const r = results[0];
    expect(r.timeSeries.some((p: any) => p.isComplete === false)).toBe(true);
    expect(r.details?.some((d: any) => String(d.label).includes('incomplete'))).toBe(true);
  });

  it('honors context.globalFilters.priority (case-insensitive) and surfaces it in details', () => {
    const issues = [
      // Within SLA, priority High
      makeIssue({ key: 'HIGH', priority: 'High', created: D(2024, 0, 9, 9), resolved: D(2024, 0, 9, 11), status: 'Done' }),
      // Breach (~52h), priority Low -> excluded by the filter
      makeIssue({ key: 'LOW', priority: 'Low', created: D(2024, 0, 9, 9), resolved: D(2024, 0, 17, 13), status: 'Done' }),
    ];
    const context = createMockContext(0, {
      issues: issues as any,
      period,
      holidays: holidaysWith(40),
      globalFilters: { priority: ['high'] },
    });

    const results = slaComplianceWeeklyPlugin.calculate(context) as any[];
    const r = results[0];
    // Only the High ticket is considered -> 100% compliance, 1 resolved
    expect(r.value).toBe(100);
    expect(r.details).toContainEqual({ label: 'Total Resolved', value: 1 });
    expect(r.details?.some((d: any) => String(d.label).includes('Priority Filter'))).toBe(true);
  });
});
