/**
 * Processing-time domain KPI plugin unit tests
 * Covers: aging_wip, avg_processing_hours, avg_working_days,
 *         first_response_time, cycle_time_histogram
 *
 * Weekday dates in 2024-01 (Jan 2 = Tuesday, non-holiday) within 09:00-17:00
 * so calculateBusinessHours / calculateWorkingDays are deterministic.
 * aging_wip uses `new Date()` as the reference, so we pin the system clock.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import agingWipPlugin from '../aging-wip';
import avgProcessingHoursPlugin from '../avg-processing-hours';
import avgWorkingDaysPlugin from '../avg-working-days';
import firstResponseTimePlugin from '../first-response-time';
import cycleTimeHistogramPlugin from '../cycle-time-histogram';
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

describe('aging_wip Plugin', () => {
  const NOW = D(2024, 0, 15, 12); // Monday Jan 15 2024

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('has correct metadata', () => {
    expect(agingWipPlugin.id).toBe('aging_wip');
    expect(agingWipPlugin.domain).toBe('processing-time');
    expect(agingWipPlugin.visualization).toBe('horizontal_bar');
    expect(agingWipPlugin.unit).toBe('tickets');
  });

  it('buckets open tickets by age in business hours and excludes done tickets', () => {
    const issues = [
      // open, created "now" -> 0h -> "< 1 day"
      makeIssue({ key: 'RECENT', status: 'Open', statusCategory: 'In Progress', created: D(2024, 0, 15, 12), resolved: null }),
      // open, created earlier -> lands in exactly one bucket
      makeIssue({ key: 'OLDER', status: 'Open', statusCategory: 'In Progress', created: D(2024, 0, 2, 9), resolved: null }),
      // done -> excluded
      makeIssue({ key: 'DONE', status: 'Done', statusCategory: 'Done', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 11) }),
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = agingWipPlugin.calculate(context) as any[];

    // Always one result per bucket (6 buckets)
    expect(results).toHaveLength(6);
    expect(results.map((r) => r.name)).toEqual([
      '< 1 day',
      '1-3 days',
      '3-7 days',
      '1-2 weeks',
      '2-4 weeks',
      '> 4 weeks',
    ]);

    // RECENT -> "< 1 day" bucket (0 business hours)
    const lt1 = results.find((r) => r.name === '< 1 day')!;
    expect(lt1.value).toBe(1);
    expect(lt1.ticketKeys).toContain('RECENT');

    // Total across buckets === number of open issues (2)
    const totalOpen = results.reduce((sum, r) => sum + r.value, 0);
    expect(totalOpen).toBe(2);

    // OLDER appears in exactly one bucket's keys; DONE never appears
    const allKeys = results.flatMap((r) => r.ticketKeys || []);
    expect(allKeys).toContain('OLDER');
    expect(allKeys).not.toContain('DONE');
  });

  it('returns six empty buckets for no open issues', () => {
    const issues = [makeIssue({ key: 'D1', status: 'Done', statusCategory: 'Done', resolved: D(2024, 0, 2, 11) })];
    const context = createMockContext(0, { issues: issues as any });
    const results = agingWipPlugin.calculate(context) as any[];
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.value === 0)).toBe(true);
  });
});

describe('avg_processing_hours Plugin', () => {
  it('has correct metadata', () => {
    expect(avgProcessingHoursPlugin.id).toBe('avg_processing_hours');
    expect(avgProcessingHoursPlugin.domain).toBe('processing-time');
    expect(avgProcessingHoursPlugin.unit).toBe('hours');
  });

  it('averages business hours from creation to resolution', () => {
    const issues = [
      makeIssue({ key: 'TEST-1', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 11) }), // 2h
      makeIssue({ key: 'TEST-2', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 13) }), // 4h
      makeIssue({ key: 'TEST-3', created: D(2024, 0, 2, 9), resolved: null }), // open -> excluded
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = avgProcessingHoursPlugin.calculate(context) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Avg. Processing Hours');
    expect(results[0].value).toBe(3); // (2+4)/2
    expect(results[0].unit).toBe('hours');
    expect(results[0].ticketKeys).toEqual(['TEST-1', 'TEST-2']);
    expect(results[0].details).toContainEqual({ label: 'Resolved Tickets', value: 2, unit: 'tickets' });
    expect(results[0].details).toContainEqual({ label: 'Total Business Hours', value: 6, unit: 'hours' });
  });

  it('returns zero when no tickets are resolved', () => {
    const issues = [makeIssue({ key: 'TEST-1', resolved: null })];
    const context = createMockContext(0, { issues: issues as any });
    const results = avgProcessingHoursPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
  });
});

describe('avg_working_days Plugin', () => {
  it('has correct metadata', () => {
    expect(avgWorkingDaysPlugin.id).toBe('avg_working_days');
    expect(avgWorkingDaysPlugin.domain).toBe('processing-time');
    expect(avgWorkingDaysPlugin.unit).toBe('days');
  });

  it('averages working days from creation to resolution', () => {
    const issues = [
      makeIssue({ key: 'TEST-1', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 17) }), // same day -> 1
      makeIssue({ key: 'TEST-2', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 4, 17) }), // Jan2-4 -> 3
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = avgWorkingDaysPlugin.calculate(context) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Avg. Working Days');
    expect(results[0].value).toBe(2); // (1+3)/2
    expect(results[0].ticketKeys).toEqual(['TEST-1', 'TEST-2']);
    expect(results[0].details).toContainEqual({ label: 'Total Working Days', value: 4, unit: 'days' });
  });

  it('returns zero when no tickets are resolved', () => {
    const issues = [makeIssue({ key: 'TEST-1', resolved: null })];
    const context = createMockContext(0, { issues: issues as any });
    const results = avgWorkingDaysPlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
  });
});

describe('first_response_time Plugin', () => {
  it('has correct metadata', () => {
    expect(firstResponseTimePlugin.id).toBe('first_response_time');
    expect(firstResponseTimePlugin.domain).toBe('processing-time');
    expect(firstResponseTimePlugin.unit).toBe('hours');
  });

  it('averages hours to first transition OR first non-reporter comment', () => {
    const issues = [
      // response via first transition (11:00) -> 2h
      makeIssue({
        key: 'TEST-1',
        reporter: 'Carol',
        created: D(2024, 0, 2, 9),
        transitions: [{ fromStatus: 'Open', toStatus: 'In Progress', author: 'x', occurredAt: D(2024, 0, 2, 11) }],
        comments: [],
      }),
      // response via first non-reporter comment (10:00) -> 1h
      makeIssue({
        key: 'TEST-2',
        reporter: 'Carol',
        created: D(2024, 0, 2, 9),
        transitions: [],
        comments: [{ author: 'Bob', created: D(2024, 0, 2, 10) }],
      }),
      // comment is by the reporter -> not a response; no transition -> not responded
      makeIssue({
        key: 'TEST-3',
        reporter: 'Carol',
        created: D(2024, 0, 2, 9),
        transitions: [],
        comments: [{ author: 'Carol', created: D(2024, 0, 2, 10) }],
      }),
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = firstResponseTimePlugin.calculate(context) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Avg. First Response Time');
    expect(results[0].value).toBe(1.5); // (2+1)/2
    expect(results[0].ticketKeys).toEqual(['TEST-1', 'TEST-2']);
    expect(results[0].details).toContainEqual({ label: 'Responded Tickets', value: 2 });
    expect(results[0].details).toContainEqual({ label: 'Total Tickets', value: 3 });
  });

  it('returns zero when there are no issues', () => {
    const context = createMockContext(0, { issues: [] as any });
    const results = firstResponseTimePlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
  });

  it('returns zero when no ticket has a response', () => {
    const issues = [
      makeIssue({ key: 'TEST-1', reporter: 'Carol', transitions: [], comments: [] }),
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = firstResponseTimePlugin.calculate(context) as any[];
    expect(results).toHaveLength(1);
    expect(results[0].value).toBe(0);
  });
});

describe('cycle_time_histogram Plugin', () => {
  it('has correct metadata', () => {
    expect(cycleTimeHistogramPlugin.id).toBe('cycle_time_histogram');
    expect(cycleTimeHistogramPlugin.domain).toBe('processing-time');
    expect(cycleTimeHistogramPlugin.visualization).toBe('horizontal_bar');
    expect(cycleTimeHistogramPlugin.unit).toBe('tickets');
  });

  it('buckets resolved tickets into cycle-time ranges and ignores open tickets', () => {
    const issues = [
      makeIssue({ key: 'TEST-1', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 11) }), // 2h -> < 4h
      makeIssue({ key: 'TEST-2', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 13) }), // 4h -> 4-8h
      makeIssue({ key: 'TEST-3', created: D(2024, 0, 2, 9), resolved: D(2024, 0, 2, 17) }), // 8h -> 8-16h
      makeIssue({ key: 'TEST-4', created: D(2024, 0, 2, 9), resolved: null }), // open -> excluded
    ];
    const context = createMockContext(0, { issues: issues as any });
    const results = cycleTimeHistogramPlugin.calculate(context) as any[];

    expect(results).toHaveLength(6);
    expect(results.map((r) => r.name)).toEqual([
      '< 4h',
      '4-8h (1d)',
      '8-16h (2d)',
      '16-40h (1w)',
      '40-80h (2w)',
      '> 80h (2w+)',
    ]);

    const byLabel = (label: string) => results.find((r) => r.name === label)!;
    expect(byLabel('< 4h').value).toBe(1);
    expect(byLabel('< 4h').ticketKeys).toEqual(['TEST-1']);
    expect(byLabel('4-8h (1d)').value).toBe(1);
    expect(byLabel('4-8h (1d)').ticketKeys).toEqual(['TEST-2']);
    expect(byLabel('8-16h (2d)').value).toBe(1);
    expect(byLabel('8-16h (2d)').ticketKeys).toEqual(['TEST-3']);

    // total resolved across buckets === 3
    expect(results.reduce((s, r) => s + r.value, 0)).toBe(3);
  });

  it('returns six empty buckets when nothing is resolved', () => {
    const issues = [makeIssue({ key: 'TEST-1', resolved: null })];
    const context = createMockContext(0, { issues: issues as any });
    const results = cycleTimeHistogramPlugin.calculate(context) as any[];
    expect(results).toHaveLength(6);
    expect(results.every((r) => r.value === 0)).toBe(true);
  });
});
