/**
 * Shared age-breakdown helper unit tests
 *
 * The helper centralizes the group-by-dimension x age-category x sort
 * algorithm previously duplicated across the open/closed ticket plugins
 * (open_tickets_by_priority, open_tickets_by_status,
 * closed_tickets_by_priority, open_tickets_by_assignee,
 * open_tickets_by_issue_owner_team).
 *
 * These tests pin the EXACT semantics the plugins had before the refactor:
 * - null/empty dimension values fall back to the 'Unassigned' bucket
 * - age categories with zero tickets are omitted
 * - ticket keys are deduplicated and keep insertion order
 * - name/details label formats ('2+ weeks old' / '1 week old' / 'This week')
 * - both sort modes (priority order vs. total-count descending)
 */

import { describe, it, expect } from 'vitest';
import {
  calculateAgeBreakdown,
  OPEN_TICKET_AGE_LABELS,
  CLOSED_TICKET_AGE_LABELS,
} from '../age-breakdown';
import type { AgeBreakdownOptions } from '../age-breakdown';
import openTicketsByStatusPlugin from '../../plugins/builtin/throughput/open-tickets-by-status';
import { isIssueDone } from '../../engine-utils';
import { createMockContext } from '../../__tests__/mocks';
import type { KpiContext, TransformedIssue } from '../../types';

const D = (y: number, mo: number, d: number, h = 9, mi = 0) =>
  new Date(y, mo, d, h, mi, 0, 0);

function makeIssue(partial: Partial<TransformedIssue> & { key: string }): TransformedIssue {
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

// Fixed reference date (mirrors a period end) so age buckets are deterministic
const REF = D(2024, 0, 31, 12, 0);

const statusOptions: AgeBreakdownOptions = {
  dimensionKey: 'status',
  dimensionLabel: 'Status',
  ageLabels: OPEN_TICKET_AGE_LABELS,
  sortBy: 'total-desc',
};

describe('calculateAgeBreakdown', () => {
  it('groups issues by dimension and splits them into age categories', () => {
    const issues = [
      // 1 day old at REF -> this_week
      makeIssue({ key: 'T-1', status: 'In Progress', created: D(2024, 0, 30, 9) }),
      // 9 days old -> 1 full week -> last_week
      makeIssue({ key: 'T-2', status: 'In Progress', created: D(2024, 0, 22, 9) }),
      // 29 days old -> 4 full weeks -> existing
      makeIssue({ key: 'T-3', status: 'In Progress', created: D(2024, 0, 2, 9) }),
      makeIssue({ key: 'T-4', status: 'To Do', created: D(2024, 0, 30, 9) }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.status,
      statusOptions,
    );

    expect(results.map((r) => r.name)).toEqual([
      'Status: In Progress (Existing)',
      'Status: In Progress (Last Week)',
      'Status: In Progress (This Week)',
      'Status: To Do (This Week)',
    ]);

    const inProgressThisWeek = results.find(
      (r) => r.dimensions?.status === 'In Progress' && r.dimensions?.ageCategory === 'this_week',
    );
    expect(inProgressThisWeek?.value).toBe(1);
    expect(inProgressThisWeek?.unit).toBe('tickets');
    expect(inProgressThisWeek?.ticketKeys).toEqual(['T-1']);
  });

  it('buckets null/empty dimension values under "Unassigned"', () => {
    const issues = [
      makeIssue({ key: 'T-1', status: '', created: D(2024, 0, 30, 9) }),
      makeIssue({ key: 'T-2', status: null as unknown as string, created: D(2024, 0, 30, 9) }),
      makeIssue({ key: 'T-3', status: 'To Do', created: D(2024, 0, 30, 9) }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.status,
      statusOptions,
    );

    expect(results).toHaveLength(2);
    const unassigned = results.find((r) => r.dimensions?.status === 'Unassigned');
    expect(unassigned?.value).toBe(2);
    expect(unassigned?.ticketKeys).toEqual(['T-1', 'T-2']);
  });

  it('builds the full result shape (name, dimensions, details, ticketKeys)', () => {
    const issues = [
      makeIssue({ key: 'T-1', status: 'In Progress', created: D(2024, 0, 2, 9) }),
      makeIssue({ key: 'T-2', status: 'In Progress', created: D(2024, 0, 2, 10) }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.status,
      statusOptions,
    );

    expect(results).toEqual([
      {
        name: 'Status: In Progress (Existing)',
        value: 2,
        unit: 'tickets',
        dimensions: { status: 'In Progress', ageCategory: 'existing' },
        ticketKeys: ['T-1', 'T-2'],
        details: [
          { label: 'Status', value: 0, unit: 'In Progress' },
          { label: 'Age', value: 0, unit: '2+ weeks old' },
        ],
      },
    ]);
  });

  it('uses the open-ticket age labels for each category', () => {
    const issues = [
      makeIssue({ key: 'T-EX', status: 'S', created: D(2024, 0, 2, 9) }),
      makeIssue({ key: 'T-LW', status: 'S', created: D(2024, 0, 22, 9) }),
      makeIssue({ key: 'T-TW', status: 'S', created: D(2024, 0, 30, 9) }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.status,
      statusOptions,
    );

    const ageLabel = (cat: string) =>
      results.find((r) => r.dimensions?.ageCategory === cat)?.details?.[1]?.unit;
    expect(ageLabel('existing')).toBe('2+ weeks old');
    expect(ageLabel('last_week')).toBe('1 week old');
    expect(ageLabel('this_week')).toBe('This week');
  });

  it('supports custom age labels (closed-ticket variant)', () => {
    const issues = [
      makeIssue({
        key: 'T-1',
        status: 'Done',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 30, 9),
      }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.resolved || i.updated,
      (i) => i.status,
      {
        dimensionKey: 'status',
        dimensionLabel: 'Status',
        ageLabels: CLOSED_TICKET_AGE_LABELS,
        sortBy: 'total-desc',
      },
    );

    expect(results).toHaveLength(1);
    expect(results[0].details?.[1]?.unit).toBe('Closed this week');
  });

  it('categorizes by the getDate accessor, not issue.created', () => {
    // created is old (existing) but getDate returns resolved -> this_week
    const issues = [
      makeIssue({
        key: 'T-1',
        status: 'Done',
        created: D(2024, 0, 2, 9),
        resolved: D(2024, 0, 30, 9),
      }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.resolved || i.updated,
      (i) => i.status,
      statusOptions,
    );

    expect(results[0].dimensions?.ageCategory).toBe('this_week');
  });

  it('omits age categories with zero tickets', () => {
    const issues = [makeIssue({ key: 'T-1', status: 'S', created: D(2024, 0, 2, 9) })];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.status,
      statusOptions,
    );

    expect(results).toHaveLength(1);
    expect(results[0].dimensions?.ageCategory).toBe('existing');
  });

  it('deduplicates ticket keys and keeps insertion order', () => {
    const issues = [
      makeIssue({ key: 'T-1', status: 'S', created: D(2024, 0, 30, 9) }),
      makeIssue({ key: 'T-2', status: 'S', created: D(2024, 0, 30, 9) }),
      // same key again -> must not be counted twice
      makeIssue({ key: 'T-1', status: 'S', created: D(2024, 0, 30, 9) }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.status,
      statusOptions,
    );

    expect(results[0].value).toBe(2);
    expect(results[0].ticketKeys).toEqual(['T-1', 'T-2']);
  });

  it('returns an empty array for an empty issue list', () => {
    expect(
      calculateAgeBreakdown([], REF, (i) => i.created, (i) => i.status, statusOptions),
    ).toEqual([]);
  });

  it('sorts by total count descending, then dimension name, then age', () => {
    const issues = [
      // "Zeta" has 2 tickets, "Alpha" has 2 tickets -> tie broken by name
      makeIssue({ key: 'Z-1', status: 'Zeta', created: D(2024, 0, 30, 9) }),
      makeIssue({ key: 'Z-2', status: 'Zeta', created: D(2024, 0, 2, 9) }),
      makeIssue({ key: 'A-1', status: 'Alpha', created: D(2024, 0, 30, 9) }),
      makeIssue({ key: 'A-2', status: 'Alpha', created: D(2024, 0, 2, 9) }),
      // "Big" has 3 tickets -> comes first despite alphabetical order
      makeIssue({ key: 'B-1', status: 'Big', created: D(2024, 0, 30, 9) }),
      makeIssue({ key: 'B-2', status: 'Big', created: D(2024, 0, 22, 9) }),
      makeIssue({ key: 'B-3', status: 'Big', created: D(2024, 0, 2, 9) }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.status,
      statusOptions,
    );

    // Within each dimension: existing -> last_week -> this_week
    expect(results.map((r) => r.name)).toEqual([
      'Status: Big (Existing)',
      'Status: Big (Last Week)',
      'Status: Big (This Week)',
      'Status: Alpha (Existing)',
      'Status: Alpha (This Week)',
      'Status: Zeta (Existing)',
      'Status: Zeta (This Week)',
    ]);
  });

  it('sorts by priority order ascending, then age, in priority mode', () => {
    const issues = [
      makeIssue({ key: 'M-1', priority: 'Medium', created: D(2024, 0, 2, 9) }),
      makeIssue({ key: 'H-1', priority: 'High', created: D(2024, 0, 30, 9) }),
      makeIssue({ key: 'H-2', priority: 'High', created: D(2024, 0, 2, 9) }),
      makeIssue({ key: 'U-1', priority: null, created: D(2024, 0, 30, 9) }),
    ];

    const results = calculateAgeBreakdown(
      issues,
      REF,
      (i) => i.created,
      (i) => i.priority,
      {
        dimensionKey: 'priority',
        dimensionLabel: 'Priority',
        ageLabels: OPEN_TICKET_AGE_LABELS,
        sortBy: 'priority',
      },
    );

    // High first (despite lower total), Medium second, Unassigned last;
    // within a dimension existing comes before this_week
    expect(results.map((r) => r.name)).toEqual([
      'Priority: High (Existing)',
      'Priority: High (This Week)',
      'Priority: Medium (Existing)',
      'Priority: Unassigned (This Week)',
    ]);
  });

  describe('parity with the pre-refactor plugins', () => {
    it('matches open_tickets_by_status output exactly for the same input', () => {
      const issues = [
        makeIssue({ key: 'P-1', status: 'In Progress', created: D(2024, 0, 30, 9) }),
        makeIssue({ key: 'P-2', status: 'In Progress', created: D(2024, 0, 22, 9) }),
        makeIssue({ key: 'P-3', status: 'In Progress', created: D(2024, 0, 2, 9) }),
        makeIssue({ key: 'P-4', status: 'To Do', created: D(2024, 0, 30, 9) }),
        makeIssue({ key: 'P-5', status: 'To Do', created: D(2024, 0, 2, 9) }),
        makeIssue({ key: 'P-6', status: '', created: D(2024, 0, 22, 9) }),
        // done issue: excluded by the plugin's filter, must not appear
        makeIssue({
          key: 'P-7',
          status: 'Done',
          statusCategory: 'Done',
          created: D(2024, 0, 2, 9),
          resolved: D(2024, 0, 5, 9),
        }),
      ];
      const period = { start: D(2024, 0, 1, 0, 0), end: REF };
      const context = createMockContext(0, { issues, period }) as KpiContext;

      const pluginResults = openTicketsByStatusPlugin.calculate(context);

      const openIssues = issues.filter((i) => !isIssueDone(i));
      const helperResults = calculateAgeBreakdown(
        openIssues,
        period.end,
        (i) => i.created,
        (i) => i.status,
        statusOptions,
      );

      expect(helperResults).toEqual(pluginResults);
    });
  });
});
